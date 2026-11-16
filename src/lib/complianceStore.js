// Case workspace store: customers, screening, cases, documents, reviews and the audit trail.
// In the browser the workspace is decrypted once when a page opens and kept in memory, so the
// rest of the app reads and writes it synchronously. Every write appends a hash-chained audit
// event and is then encrypted (AES-GCM) before it is stored: on this device in the demo
// workspace, or as one encrypted team record in Firebase in the live workspace.
// Outside the browser (unit tests) it falls back to plain synchronous storage.
import { payloadUpdate } from './workspaceSync.js';
import { seedCompliance } from '../data/complianceData.js';
import { defaultPolicy } from './amlEngine.js';
import { appendEvent } from './auditChain.js';

const PLAIN_KEY = 'acurion.compliance.sandbox.v2';
const ENCRYPTED_KEY = 'acurion.workspace.encrypted.v1';
const VAULT_KEY = 'acurion.workspace.vault.v1';

let current = null, backend = null, actor = 'workspace:analyst', queue = Promise.resolve(), pendingState = null;
const listeners = new Set();
const emit = status => { for (const listener of listeners) listener(status); if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('acurion:workspace-status', { detail: status })); };

function normalize(state) {
  if (state.schemaVersion !== 1 || !Array.isArray(state.customers) || !Array.isArray(state.audit)) throw new Error('This workspace was saved by an incompatible version. Export it, then start a new workspace.');
  state.policy = { ...defaultPolicy, ...state.policy };
  state.rejectedEvents ||= [];
  state.alertReviews ||= { reviews: {} };
  return state;
}

export function loadWorkspace() {
  if (current) return structuredClone(current);
  const raw = localStorage.getItem(PLAIN_KEY);
  if (!raw) { const initial = normalize(seedCompliance()); localStorage.setItem(PLAIN_KEY, JSON.stringify(initial)); return initial; }
  return normalize(JSON.parse(raw));
}

export function saveWorkspace(state, action, detail = '') {
  const next = structuredClone(state);
  next.audit = appendEvent(next.audit || [], { id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, detail });
  if (!current) { localStorage.setItem(PLAIN_KEY, JSON.stringify(next)); return next; }
  current = next;
  persist(next);
  return structuredClone(next);
}

// Writes are serialised; only the newest state is encrypted if several saves queue up.
function persist(state) {
  pendingState = state;
  emit({ state: 'saving', label: backend?.label });
  queue = queue.then(async () => {
    if (!pendingState) return;
    const snapshot = pendingState; pendingState = null;
    try { await backend.write(snapshot); emit({ state: 'saved', label: backend.label, at: new Date().toISOString() }); }
    catch (error) { emit({ state: 'error', label: backend.label, message: error.message || 'The workspace could not be saved.', code: error.code }); }
  });
  return queue;
}

export function workspaceInfo() { return { open: Boolean(current), encrypted: Boolean(backend?.encrypted), label: backend?.label || 'Not opened', actor, location: backend?.location || 'none', readOnly: backend?.readOnly || '', readOnlyTitle: backend?.readOnlyTitle || '' }; }
export function onWorkspaceStatus(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function flushWorkspace() { return queue; }

export async function lockWorkspace() {
  const { forgetKeys } = await import('./vault.js');
  await flushWorkspace();
  await forgetKeys();
}

// Removes the demo workspace from this device (encrypted data, vault settings and any legacy copy).
export async function resetLocalWorkspace() {
  const { forgetKeys } = await import('./vault.js');
  for (const key of [ENCRYPTED_KEY, VAULT_KEY, PLAIN_KEY, 'acurion.compliance.sandbox.v1', 'acurion.demo.alert-reviews.v1']) localStorage.removeItem(key);
  await forgetKeys();
}

async function unlock({ scope, scopeLabel, readConfig, writeConfig, canReset }) {
  const vault = await import('./vault.js');
  const { requestPassphrase } = await import('../components/lockScreen.js');
  let key = await vault.recallKey(scope), config = await readConfig(), error = '';
  while (!key) {
    const answer = await requestPassphrase({ mode: config ? 'unlock' : 'setup', scopeLabel, error, canReset });
    if (answer.reset) { await resetLocalWorkspace(); answer.done(); location.reload(); return new Promise(() => {}); }
    try {
      if (config) key = await vault.unlockVault(config, answer.passphrase);
      else { const created = await vault.createVaultConfig(answer.passphrase); await writeConfig(created.config); config = created.config; key = created.key; }
      answer.done();
    } catch (failure) { error = failure.message || 'The workspace could not be unlocked.'; answer.done(); }
  }
  await vault.rememberKey(scope, key);
  return { key, vault };
}

async function openLocal() {
  const { key, vault } = await unlock({
    scope: 'local', scopeLabel: 'Demo workspace on this device', canReset: true,
    readConfig: async () => JSON.parse(localStorage.getItem(VAULT_KEY) || 'null'),
    writeConfig: async config => localStorage.setItem(VAULT_KEY, JSON.stringify(config)),
  });
  const stored = localStorage.getItem(ENCRYPTED_KEY), legacy = localStorage.getItem(PLAIN_KEY);
  const state = stored ? await vault.decryptJSON(key, JSON.parse(stored)) : legacy ? JSON.parse(legacy) : seedCompliance();
  backend = { encrypted: true, location: 'device', label: 'Encrypted on this device', write: async value => localStorage.setItem(ENCRYPTED_KEY, JSON.stringify(await vault.encryptJSON(key, value))) };
  current = normalize(state);
  actor = 'demo:analyst';
  if (!stored) { await backend.write(current); localStorage.removeItem(PLAIN_KEY); } // plaintext copies are removed once encrypted
}

async function openTeam(user) {
  const [{ db }, { ref, get, set, runTransaction }, { DATA_PATHS, TEAM_ID }] = await Promise.all([import('./firebase.js'), import('firebase/database'), import('./config.js')]);
  const base = `${DATA_PATHS.cases}/${TEAM_ID}`;
  const existing = (await get(ref(db, `${base}/vault`))).val();
  if (!existing) {
    const role = (await get(ref(db, `roles/${user.uid}`)).catch(() => null))?.val();
    if (!['reviewer', 'admin'].includes(role)) throw Object.assign(new Error('The team workspace is not set up yet.'), { code: 'workspace/not-set-up' });
  }
  const { key, vault } = await unlock({
    scope: `team:${TEAM_ID}:${user.uid}`, scopeLabel: 'Team case workspace', canReset: false,
    readConfig: async () => (await get(ref(db, `${base}/vault`))).val(),
    writeConfig: async config => set(ref(db, `${base}/vault`), { ...config, createdBy: user.uid }),
  });
  const snapshot = (await get(ref(db, `${base}/payload`))).val();
  let version = snapshot?.version || 0;
  current = normalize(snapshot ? await vault.decryptJSON(key, snapshot) : seedCompliance());
  actor = user.email || user.uid;
  backend = {
    encrypted: true, location: 'firebase', label: 'Encrypted team workspace (Firebase)',
    write: async value => {
      const sealed = await vault.encryptJSON(key, value);
      const result = await runTransaction(ref(db, `${base}/payload`), payloadUpdate(version, sealed, user.uid), { applyLocally: false });
      if (!result.committed) throw Object.assign(new Error('A teammate saved the workspace first. Reload to see their changes, then repeat your last action.'), { code: 'workspace/conflict' });
      version = result.snapshot.val().version;
    },
  };
  if (!snapshot) await backend.write(current);
}

export async function openWorkspace() {
  if (current) return;
  const { DEMO_MODE } = await import('./config.js');
  if (DEMO_MODE) return openLocal();
  const { auth } = await import('./firebase.js');
  await auth.authStateReady?.();
  const user = auth.currentUser;
  if (!user || !user.emailVerified) { current = normalize(seedCompliance()); backend = { encrypted: false, location: 'none', label: 'Sign in to open the team workspace', write: async () => { throw Object.assign(new Error('Sign in to save to the team case workspace.'), { code: 'auth/session-required' }); } }; return; }
  try { await openTeam(user); }
  catch (error) {
    const reason = error.code === 'workspace/not-set-up' ? 'not-set-up' : /permission|denied/i.test(`${error.code} ${error.message}`) ? 'read-only' : '';
    if (!reason) throw error;
    // No private stand-in workspace on this device (it looked shared but was not): an empty, read-only one that
    // says why, so nothing is kept where the team cannot see it.
    const message = reason === 'not-set-up'
      ? 'A reviewer or admin opens Cases first to choose the team passphrase. Then everyone can work on cases here.'
      : 'Your account is read-only. Ask an admin for the analyst role to work on cases.';
    current = normalize(emptyWorkspace());
    actor = user.email || user.uid;
    backend = { encrypted: false, location: 'none', label: reason === 'not-set-up' ? 'Team workspace not set up yet' : 'Read-only: cases need the analyst role', readOnly: message, readOnlyTitle: reason === 'not-set-up' ? 'Cases are not set up yet.' : 'Cases are read-only for you.', write: async () => { throw Object.assign(new Error(message), { code: `workspace/${reason}` }); } };
  }
}

// The workspace's shape with no records, for accounts that cannot open the team workspace.
function emptyWorkspace() {
  const seed = seedCompliance();
  return { ...seed, customers: [], counterparties: [], transactions: [], watchlist: [], findings: [], assessments: [], cases: [], documents: [], audit: [], riskHistory: [], runs: [] };
}

if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && !globalThis.__ACURION_NO_WORKSPACE__) {
  try { await openWorkspace(); }
  catch (error) {
    // Never fall back to unencrypted storage: keep an in-memory workspace and say why saving is off.
    current ||= normalize(seedCompliance());
    backend = { encrypted: false, location: 'none', label: 'Case workspace unavailable', write: async () => { throw Object.assign(new Error(`The case workspace could not be opened: ${error.message}`), { code: error.code || 'workspace/unavailable' }); } };
    emit({ state: 'error', label: backend.label, message: error.message });
  }
}

export function downloadJSON(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
