import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectCsv, uploadProblem, packFile, toBase64, splitChunks, MAX_UPLOAD_BYTES, CHUNK_CHARS } from '../src/lib/uploadPacking.js';

const csv = 'Timestamp,From Bank,Account,To Bank,Account,Amount Paid,Payment Currency\n' + '2022/09/06 00:00,11318,80100DB30,16109,80805A830,93.2,US Dollar\n'.repeat(30000);

test('a packed file rebuilds byte for byte, with its SHA-256, through gzip, base64 and chunks', async () => {
  const bytes = new TextEncoder().encode(csv);
  const packed = await packFile(bytes);
  assert.equal(packed.bytes, bytes.length);
  assert.ok(packed.packedBytes < bytes.length / 4, 'a repetitive CSV compresses well');
  assert.ok(packed.chunks.every(c => c.length <= CHUNK_CHARS));
  const rebuilt = gunzipSync(Buffer.from(packed.chunks.join(''), 'base64'));
  assert.ok(Buffer.from(bytes).equals(rebuilt));
  assert.equal(packed.sha256, createHash('sha256').update(bytes).digest('hex'));
});

test('base64 in slices equals one-shot base64 at every length', () => {
  for (const length of [0, 1, 2, 3, 49151, 49152, 49153, 200000]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 31 + 7) % 256);
    assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'), String(length));
  }
  assert.deepEqual(splitChunks('abcdefg', 3), ['abc', 'def', 'g']);
});

test('the header, delimiter and an honest row estimate are read from the start of the file', () => {
  const sample = csv.slice(0, 4096);
  const inspection = inspectCsv(sample, csv.length);
  assert.equal(inspection.delimiter, ',');
  assert.deepEqual(inspection.columns.slice(0, 3), ['Timestamp', 'From Bank', 'Account']);
  assert.ok(Math.abs(inspection.rowsEstimate - 30000) < 300);
  assert.deepEqual(inspectCsv('﻿a;"b;c";d\n1;2;3\n', 20).columns, ['a', 'b;c', 'd']);
});

test('files the host cannot take are refused with a reason', () => {
  assert.match(uploadProblem({ name: 'data.xlsx', size: 10 }), /CSV/);
  assert.match(uploadProblem({ name: 'data.csv', size: 0 }), /empty/);
  assert.match(uploadProblem({ name: 'data.csv', size: MAX_UPLOAD_BYTES + 1 }), /limit is 100 MB/);
  assert.match(uploadProblem({ name: 'data.csv', size: 10 }, { columns: ['only'] }), /name the columns/);
  assert.equal(uploadProblem({ name: 'DATA.CSV', size: 10 }, { columns: ['a', 'b', 'c'] }), '');
});
