import test from 'node:test';
import assert from 'node:assert/strict';
import { payloadUpdate } from '../src/lib/workspaceSync.js';

test('a workspace save proposes its write when Firebase has not sent the current value yet', () => {
  const update = payloadUpdate(4, { iv: 'i', ct: 'c' }, 'uid-1', () => 'now');
  assert.deepEqual(update(null), { iv: 'i', ct: 'c', version: 5, updatedAt: 'now', updatedBy: 'uid-1' });
});
test('a workspace save goes ahead on the version it read and stops when a teammate saved first', () => {
  const update = payloadUpdate(4, { iv: 'i', ct: 'c' }, 'uid-1', () => 'now');
  assert.equal(update({ version: 4, iv: 'x', ct: 'y' }).version, 5);
  assert.equal(update({ version: 5, iv: 'x', ct: 'y' }), undefined);
  assert.equal(payloadUpdate(0, {}, 'u')(null).version, 1, 'the first save writes version 1');
});
