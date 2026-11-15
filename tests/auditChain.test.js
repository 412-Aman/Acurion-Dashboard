import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex, canonicalJSON } from '../src/lib/sha256.js';
import { appendEvent, verifyChain, GENESIS } from '../src/lib/auditChain.js';

test('sha256Hex matches Node crypto for empty, short, multi-block and unicode input', () => {
  for (const value of ['', 'abc', 'a'.repeat(64), 'x'.repeat(1000), 'Layla Haddad → CP-2001 · 70,000 AED']) {
    assert.equal(sha256Hex(value), createHash('sha256').update(value, 'utf8').digest('hex'));
  }
});

test('canonicalJSON is independent of key order', () => {
  assert.equal(canonicalJSON({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), canonicalJSON({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
});

const add = (audit, n) => appendEvent(audit, { id: `E${n}`, at: `2026-11-0${n}T10:00:00Z`, actor: 'analyst', action: `Action ${n}`, detail: `Detail ${n}` });

test('an untouched chain verifies and links to genesis', () => {
  let audit = [];
  for (let n = 1; n <= 4; n++) audit = add(audit, n);
  assert.equal(audit.at(-1).prevHash, GENESIS);
  const result = verifyChain(audit);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 4);
});

test('editing, deleting or reordering an event is detected', () => {
  let audit = [];
  for (let n = 1; n <= 4; n++) audit = add(audit, n);
  const edited = structuredClone(audit); edited[2].detail = 'Changed later';
  assert.equal(verifyChain(edited).ok, false);
  assert.equal(verifyChain(edited).brokenAt.id, 'E2');
  const deleted = audit.filter(e => e.id !== 'E2');
  assert.equal(verifyChain(deleted).ok, false);
  const reordered = [audit[1], audit[0], ...audit.slice(2)];
  assert.equal(verifyChain(reordered).ok, false);
});
