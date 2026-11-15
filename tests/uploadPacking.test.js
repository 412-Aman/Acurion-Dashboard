import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectCsv, uploadProblem, packFile, toBase64, splitChunks, MAX_UPLOAD_BYTES, CHUNK_CHARS, guessColumns, reviewMapping, reviewProblem, COLUMN_FIELDS, REQUIRED_FIELDS } from '../src/lib/uploadPacking.js';

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

// -- the column review --------------------------------------------------------------------------------------

const profile = [
  { name: 'Ref', kind: 'text', distinct: 1, samples: ['P-1001', 'P-1002', 'P-1003'] },
  { name: 'Acct Holder', kind: 'text', distinct: 0.62, samples: ['ACC-10293', 'ACC-55812', 'ACC-77120'] },
  { name: 'Counterparty Acct', kind: 'text', distinct: 0.7, samples: ['ACC-90001', 'ACC-23410', 'ACC-55812'] },
  { name: 'Branch', kind: 'text', distinct: 0.03, samples: ['Leeds', 'York'] },
  { name: 'Amt GBP', kind: 'number', distinct: 0.9, samples: ['1,250.00', '80.50', '9,999.99'] },
  { name: 'Flag', kind: 'number', distinct: 0.01, samples: ['0', '1'] },
  { name: 'Booked', kind: 'date', distinct: 0.8, samples: ['03/09/2026 10:15', '03/09/2026 10:16'] },
];

test('the review guesses the required fields the host could not match, from names and sample values', () => {
  const guesses = guessColumns(profile, {});
  assert.deepEqual(guesses, { amount: 'Amt GBP', timestamp: 'Booked', sender: 'Acct Holder', receiver: 'Counterparty Acct' });
  assert.deepEqual(guessColumns(profile, { sender: 'Acct Holder', receiver: 'Counterparty Acct', amount: 'Amt GBP', timestamp: 'Booked' }), {});
  // Columns the host already uses are never guessed again, and a 0/1 flag is never an amount.
  assert.equal(guessColumns(profile.filter(c => c.name !== 'Amt GBP'), {}).amount, undefined);
  assert.equal(guessColumns(profile, { sender: 'Counterparty Acct' }).receiver, 'Acct Holder');
});

test('the confirmed mapping names a column per field, blanks a match the uploader rejects, and skips fixed layouts', () => {
  const suggested = { sender: 'From', receiver: 'To', amount: 'Amount', timestamp: 'Date', transaction_id: 'Ref', payment_currency: 'Ccy' };
  const picks = { sender: 'From', receiver: 'To', amount: 'Amount', timestamp: 'Date', transaction_id: '', payment_currency: 'Ccy', label: 'Flag' };
  assert.deepEqual(reviewMapping(picks, suggested), { sender: 'From', receiver: 'To', amount: 'Amount', timestamp: 'Date', transaction_id: '', payment_currency: 'Ccy', label: 'Flag' });
  assert.deepEqual(reviewMapping({ sender: 'From' }, suggested, ['sender', 'receiver', 'amount', 'timestamp']), { transaction_id: '', payment_currency: '' });
  assert.deepEqual(reviewMapping({}, {}), {});
  // The date order travels with the mapping only when the chosen date column could be read both ways.
  const columns = [{ name: 'Booked', kind: 'date', dateOrder: 'ambiguous', samples: [] }, { name: 'Posted', kind: 'date', dateOrder: 'day_first', samples: [] }];
  assert.deepEqual(reviewMapping({ timestamp: 'Booked', date_order: 'month_first' }, {}, [], columns), { timestamp: 'Booked', date_order: 'month_first' });
  assert.deepEqual(reviewMapping({ timestamp: 'Booked' }, {}, [], columns), { timestamp: 'Booked', date_order: 'day_first' });
  assert.deepEqual(reviewMapping({ timestamp: 'Posted', date_order: 'month_first' }, {}, [], columns), { timestamp: 'Posted' });
  assert.equal(reviewProblem({ sender: 'A', receiver: 'B', amount: 'C', timestamp: 'D', date_order: 'day_first' }), '');
});

test('the review cannot be confirmed with a required field empty or a column used twice', () => {
  assert.deepEqual(REQUIRED_FIELDS, ['sender', 'receiver', 'amount', 'timestamp']);
  assert.match(reviewProblem({ sender: 'A', receiver: 'B', amount: 'C' }), /date and time column\./);
  assert.match(reviewProblem({ sender: 'A' }), /receiver, amount, date and time columns\./);
  assert.match(reviewProblem({ sender: 'A', receiver: 'A', amount: 'C', timestamp: 'D' }), /“A” is chosen for two fields/);
  assert.equal(reviewProblem({ sender: 'A', receiver: 'B', amount: 'C', timestamp: 'D', label: '' }), '');
  assert.equal(reviewProblem({}, ['sender', 'receiver', 'amount', 'timestamp']), '');
  assert.ok(COLUMN_FIELDS.every(f => f.id && f.label));
});
