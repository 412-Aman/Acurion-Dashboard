// Client-side encryption for the case workspace (WebCrypto only, no dependencies).
// A passphrase is stretched with PBKDF2-SHA-256 into a non-extractable AES-GCM-256 key.
// The key is cached in IndexedDB for the working session so pages don't ask again; it is
// cleared when the workspace is locked, on sign-out and after inactivity.
const ITERATIONS = 310000;
const CHECK = 'acurion-vault-check-v1';
const DB = 'acurion-vault', STORE = 'keys';
const SESSION_MS = 8 * 60 * 60 * 1000;

// Chunked so multi-megabyte workspaces (uploaded documents) don't overflow the argument limit.
const toB64 = bytes => { const view = new Uint8Array(bytes); let text = ''; for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000)); return btoa(text); };
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const encoder = new TextEncoder(), decoder = new TextDecoder();

export async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return { v: 1, alg: 'AES-GCM-256', iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON(key, payload) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.ct));
  return JSON.parse(decoder.decode(plain));
}

export async function createVaultConfig(passphrase) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  return { config: { kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt, check: await encryptJSON(key, CHECK), createdAt: new Date().toISOString() }, key };
}

export async function unlockVault(config, passphrase) {
  const key = await deriveKey(passphrase, config.salt, config.iterations);
  try { if (await decryptJSON(key, config.check) !== CHECK) throw new Error(); }
  catch { throw Object.assign(new Error('That passphrase does not unlock this workspace.'), { code: 'vault/wrong-passphrase' }); }
  return key;
}

function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function store(mode, run) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode), request = run(tx.objectStore(STORE));
    tx.oncomplete = () => { database.close(); resolve(request?.result); };
    tx.onerror = () => { database.close(); reject(tx.error); };
  });
}

// CryptoKey objects can be stored in IndexedDB without ever exposing the raw key bytes.
export async function rememberKey(scope, key) { await store('readwrite', s => s.put({ key, expiresAt: Date.now() + SESSION_MS }, scope)); }
export async function recallKey(scope) {
  try {
    const record = await store('readonly', s => s.get(scope));
    if (!record || record.expiresAt < Date.now()) return null;
    return record.key;
  } catch { return null; }
}
export async function forgetKeys() { try { await store('readwrite', s => s.clear()); } catch {} }

// Signing keys for exported reports: ECDSA P-256. The private key never leaves IndexedDB.
export async function signingKey(scope) {
  const id = `signing:${scope}`;
  const existing = await store('readonly', s => s.get(id)).catch(() => null);
  if (existing?.privateKey) return existing;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const record = { privateKey: pair.privateKey, publicJwk, createdAt: new Date().toISOString() };
  await store('readwrite', s => s.put(record, id));
  return record;
}
export async function signText(scope, text) {
  const { privateKey, publicJwk } = await signingKey(scope);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(text));
  return { algorithm: 'ECDSA-P256-SHA256', signature: toB64(signature), publicKey: publicJwk };
}
export async function verifySignedText(text, { signature, publicKey }) {
  const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64(signature), encoder.encode(text));
}
export async function sha256File(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
