import test from 'node:test';
import assert from 'node:assert/strict';
import { notify, onNotify } from '../src/lib/notify.js';

test('pop-ups sent before the header pill loads wait, then arrive in order; later ones go straight through', () => {
  notify({ tone: 'ok', title: 'Review saved' });
  notify({ tone: 'warn', title: 'Not saved' });
  const seen = [];
  const stop = onNotify(notice => seen.push(notice));
  assert.deepEqual(seen.map(n => n.title), ['Review saved', 'Not saved']);
  assert.ok(seen.every(n => n.key), 'every notice gets a key');
  notify({ title: 'K7 is ready' });
  assert.equal(seen.at(-1).title, 'K7 is ready');
  assert.equal(seen.at(-1).tone, 'info', 'tone defaults to info');
  stop();
  notify({ title: 'Queued again' });
  const later = [];
  onNotify(notice => later.push(notice.title));
  assert.deepEqual(later, ['Queued again']);
});
