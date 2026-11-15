// Prepares a CSV dataset for the Acurion host: checks it, fingerprints it (SHA-256), gzips it in the
// browser and splits it into base64 chunks that Firebase can carry (host/acurion_bridge.py rebuilds it).
// Pure browser APIs only, so it is unit tested in Node too.

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const CHUNK_CHARS = 512 * 1024;   // base64 characters per Firebase chunk (the rules allow 700,000)
export const MAX_CHUNKS = 300;

// The header and a row estimate from the start of the file (`sample` is its first few kilobytes).
export function inspectCsv(sample, totalBytes) {
  const text = String(sample || '').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const header = lines[0] || '';
  const delimiter = [',', ';', '\t', '|'].map(d => [d, splitCsvLine(header, d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const columns = splitCsvLine(header, delimiter).map(c => c.trim()).filter(Boolean);
  const complete = lines.slice(1, -1).filter(line => line.trim());
  const averageRow = complete.length ? complete.reduce((sum, line) => sum + line.length + 1, 0) / complete.length : 0;
  const rowsEstimate = averageRow ? Math.max(complete.length, Math.round((totalBytes - header.length - 1) / averageRow)) : 0;
  return { columns, delimiter, rowsEstimate };
}

function splitCsvLine(line, delimiter) {
  const out = []; let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) { if (c === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === delimiter) { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

// A readable reason the file cannot be uploaded, or '' when it can.
export function uploadProblem({ name, size }, inspection) {
  if (!/\.csv$/i.test(name || '')) return 'Choose a CSV file (.csv). Export spreadsheets as CSV first.';
  if (!size) return 'This file is empty.';
  if (size > MAX_UPLOAD_BYTES) return `This file is ${formatBytes(size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}; split it by date and upload each part.`;
  if (inspection && inspection.columns.length < 3) return 'The first row must name the columns (for example sender, receiver, amount and time).';
  return '';
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Base64 in slices (a multiple of 3 bytes each, so the pieces join into one valid string).
export function toBase64(bytes) {
  const parts = [], slice = 3 * 16384;
  for (let i = 0; i < bytes.length; i += slice) {
    const piece = bytes.subarray(i, i + slice);
    let binary = '';
    for (let j = 0; j < piece.length; j += 8192) binary += String.fromCharCode.apply(null, piece.subarray(j, j + 8192));
    parts.push(btoa(binary));
  }
  return parts.join('');
}

export function splitChunks(text, size = CHUNK_CHARS) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length ? chunks : [''];
}

// ---------------------------------------------------------------------------------------------------------
// Column review. The host reads the file's columns with the backend's own standardisation and writes what
// it matched (uploadJobs/{id}/host/columns); the uploader confirms, or corrects, every field before any
// scoring. These are the fields, in the order the review shows them.
// ---------------------------------------------------------------------------------------------------------

export const COLUMN_FIELDS = [
  { id: 'sender', label: 'Sender', hint: 'The account the money leaves', required: true },
  { id: 'receiver', label: 'Receiver', hint: 'The account the money reaches', required: true },
  { id: 'amount', label: 'Amount', hint: 'The amount sent', required: true },
  { id: 'timestamp', label: 'Date and time', hint: 'When the payment happened. A date-only column works with a separate time column', required: true },
  { id: 'transaction_id', label: 'Transaction ID', hint: 'Made from each row when the file has none' },
  { id: 'time_of_day', label: 'Time of day', hint: 'Only when the date and the time are separate columns', more: true },
  { id: 'payment_currency', label: 'Currency', hint: 'Of the amount sent', more: true },
  { id: 'amount_received', label: 'Amount received', hint: 'When it differs from the amount sent', more: true },
  { id: 'receiving_currency', label: 'Receiving currency', hint: 'Of the amount received', more: true },
  { id: 'payment_format', label: 'Payment type', hint: 'Wire, ACH, card, cash and so on', more: true },
  { id: 'sender_bank', label: 'Sender’s bank', hint: '', more: true },
  { id: 'receiver_bank', label: 'Receiver’s bank', hint: '', more: true },
  { id: 'label', label: 'Known outcome', hint: 'Only measures the results, never used for scoring', more: true },
];
export const REQUIRED_FIELDS = COLUMN_FIELDS.filter(f => f.required).map(f => f.id);

const NAME_HINTS = {
  sender: /from|orig|payer|debit|sender|source|remit|out|src/i, receiver: /\bto\b|dest|benef|credit|receiv|payee|target|\bin\b|counterpart/i,
  amount: /amount|amt|value|sum|total|paid|debit|credit/i, timestamp: /date|time|stamp|posted|booked|when|created/i,
};

// Best guesses for the required fields the host could not match, from each column's name and sample values
// ({ name, kind: 'number' | 'date' | 'time' | 'text' | 'empty', distinct: 0..1, samples }). Returns
// { field: columnName } for the fields it could guess; the review marks them "check" rather than "matched".
export function guessColumns(columns, suggested = {}) {
  const used = new Set(Object.values(suggested).filter(Boolean)), guesses = {};
  const free = (filter) => columns.filter(c => !used.has(c.name) && filter(c));
  const take = (field, candidates, score) => {
    const best = candidates.map(c => [c, score(c)]).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 0) return;
    guesses[field] = best[0].name; used.add(best[0].name);
  };
  if (!suggested.amount) take('amount', free(c => c.kind === 'number' && c.distinct > 0.1), c => (NAME_HINTS.amount.test(c.name) ? 2 : 0) + (c.samples.some(s => /[.,]\d{1,2}$/.test(s)) ? 1 : 0));
  if (!suggested.timestamp) take('timestamp', free(c => c.kind === 'date'), c => NAME_HINTS.timestamp.test(c.name) ? 1 : 0);
  // Accounts repeat across rows and are not called "ref" or "id"; a column of unique values is a reference.
  const ids = () => free(c => c.kind === 'text' && c.distinct >= 0.3);
  const account = c => (c.distinct >= 0.98 ? -1 : 0) + (/\bref|\bid\b|_id$|number|\bno\.?$/i.test(c.name) ? -1 : 0);
  if (!suggested.sender) take('sender', ids(), c => account(c) + (NAME_HINTS.sender.test(c.name) ? 2 : NAME_HINTS.receiver.test(c.name) ? -1 : 0));
  if (!suggested.receiver) take('receiver', ids(), c => account(c) + (NAME_HINTS.receiver.test(c.name) ? 2 : NAME_HINTS.sender.test(c.name) ? -1 : 0));
  return guesses;
}

// Dates written as 03/09/2026 can be read both ways; the host marks such a column 'ambiguous' when nothing in
// its first rows settles the order, and the review then asks.
export const dateOrderNeeded = (columns, timestampColumn) => columns.find(c => c.name === timestampColumn)?.dateOrder === 'ambiguous';

// The mapping to send to the host from the review's picks: a column name per field, '' for a field the host
// matched but the uploader says is not in the file, nothing for fields left alone, plus the date order when
// the chosen date column needs one. Fixed layouts send no columns.
export function reviewMapping(picks, suggested = {}, fixed = [], columns = []) {
  const mapping = {};
  for (const { id } of COLUMN_FIELDS) {
    if (fixed.includes(id)) continue;
    const pick = picks[id] ?? '';
    if (pick) mapping[id] = pick;
    else if (suggested[id]) mapping[id] = '';
  }
  if (dateOrderNeeded(columns, picks.timestamp)) mapping.date_order = picks.date_order === 'month_first' ? 'month_first' : 'day_first';
  return mapping;
}

// Why the review cannot be confirmed yet, or '' when it can.
export function reviewProblem(picks, fixed = []) {
  const missing = REQUIRED_FIELDS.filter(id => !fixed.includes(id) && !picks[id]);
  if (missing.length) return `Choose the ${missing.map(id => COLUMN_FIELDS.find(f => f.id === id).label.toLowerCase()).join(', ')} column${missing.length > 1 ? 's' : ''}.`;
  const chosen = Object.entries(picks).filter(([field, column]) => column && field !== 'date_order');
  const twice = chosen.find(([, column], index) => chosen.findIndex(([, other]) => other === column) !== index);
  if (twice) return `“${twice[1]}” is chosen for two fields. A column can be used once.`;
  return '';
}

// The whole file as Firebase chunks. Throws with a readable message when it cannot be carried.
export async function packFile(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const [sha256, packed] = await Promise.all([sha256Hex(raw), gzip(raw)]);
  const chunks = splitChunks(toBase64(packed));
  if (chunks.length > MAX_CHUNKS) throw Object.assign(new Error(`This file does not compress enough to upload (${formatBytes(packed.length)} packed). Split it by date and upload each part.`), { code: 'upload/too-large' });
  return { bytes: raw.length, packedBytes: packed.length, sha256, chunks };
}
