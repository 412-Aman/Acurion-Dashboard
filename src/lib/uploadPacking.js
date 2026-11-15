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

// The whole file as Firebase chunks. Throws with a readable message when it cannot be carried.
export async function packFile(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const [sha256, packed] = await Promise.all([sha256Hex(raw), gzip(raw)]);
  const chunks = splitChunks(toBase64(packed));
  if (chunks.length > MAX_CHUNKS) throw Object.assign(new Error(`This file does not compress enough to upload (${formatBytes(packed.length)} packed). Split it by date and upload each part.`), { code: 'upload/too-large' });
  return { bytes: raw.length, packedBytes: packed.length, sha256, chunks };
}
