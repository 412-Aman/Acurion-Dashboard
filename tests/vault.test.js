import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultConfig, unlockVault, encryptJSON, decryptJSON } from '../src/lib/vault.js';

test('a workspace encrypted with a passphrase round-trips and the ciphertext hides the content', async () => {
  const { config, key } = await createVaultConfig('correct horse battery');
  const state = { customers: [{ name: 'Layla Haddad' }], notes: 'x'.repeat(200000) };
  const payload = await encryptJSON(key, state);
  assert.ok(!payload.ct.includes('Layla'));
  const unlocked = await unlockVault(config, 'correct horse battery');
  assert.deepEqual(await decryptJSON(unlocked, payload), state);
});

test('a wrong passphrase is rejected and tampered ciphertext fails to decrypt', async () => {
  const { config, key } = await createVaultConfig('correct horse battery');
  await assert.rejects(unlockVault(config, 'wrong passphrase'), { code: 'vault/wrong-passphrase' });
  const payload = await encryptJSON(key, { amount: 70000 });
  const bytes = Buffer.from(payload.ct, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptJSON(key, { ...payload, ct: bytes.toString('base64') }));
});
