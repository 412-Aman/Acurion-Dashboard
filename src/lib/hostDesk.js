// The website's side of the Acurion host: K7 live detection (Start / Pause, progress, newest alerts) and
// dataset uploads. Everything goes through Firebase; the host bridge (host/acurion_bridge.py) answers.
// The browser never calls the host computer directly, so this works from any laptop and any browser.
import { ref, onValue, update, push, set, serverTimestamp, query, orderByChild, limitToLast, get } from 'firebase/database';
import { db, requireSession } from './firebase.js';
import { DEMO_MODE, DATA_PATHS } from './config.js';
import { withTimeout } from './dataStatus.js';
import { normalizeHostStatus } from './hostStatus.js';
import { packFile } from './uploadPacking.js';

// Written out in full (not via config.HOST_PREVIEW) so production builds drop the preview module entirely.
const preview = import.meta.env.DEV && import.meta.env.VITE_HOST_PREVIEW === 'true' ? import('./hostPreview.js') : null;
const listeners = new Set();
let raw, offset = 0, started = false, signedIn = true, current = normalizeHostStatus(undefined, Date.now());
const serverNow = () => Date.now() + offset;
const emit = () => { current = normalizeHostStatus(raw, serverNow(), { signedIn }); for (const listener of listeners) listener(current); };

function start() {
  if (started) return; started = true;
  if (preview) { preview.then(module => module.watchPreviewStatus(value => { raw = value; emit(); })); setInterval(emit, 5000); return; }
  if (DEMO_MODE) { signedIn = false; emit(); return; }
  withTimeout(requireSession()).then(() => {
    onValue(ref(db, '.info/serverTimeOffset'), snapshot => { offset = Number(snapshot.val()) || 0; });
    onValue(ref(db, `${DATA_PATHS.hostDesk}/status`), snapshot => { raw = snapshot.val(); emit(); }, () => { raw = null; emit(); });
    setInterval(emit, 5000);
  }).catch(() => { signedIn = false; emit(); });
}

// Calls `listener` with the normalized status now and on every change; returns the unsubscribe function.
export function watchHost(listener) {
  listeners.add(listener); start(); listener(current);
  return () => listeners.delete(listener);
}
export const hostStatus = () => current;

// Start or Pause. Resolves with the host's answer ({ ok, message }) or a timeout explanation.
export async function sendDeskCommand(action) {
  if (preview) return (await preview).previewCommand(action);
  const user = await withTimeout(requireSession());
  const id = crypto.randomUUID(), auditKey = push(ref(db, DATA_PATHS.audit)).key;
  const label = action === 'start' ? 'Started Acurion K7 live detection' : 'Paused Acurion K7 live detection';
  await withTimeout(update(ref(db), {
    [`${DATA_PATHS.hostDesk}/command`]: { id, action, by: user.uid, at: serverTimestamp() },
    [`${DATA_PATHS.audit}/${auditKey}`]: { id: auditKey, timestamp: new Date().toISOString(), action: label, actor: user.uid, detail: 'Command sent to the Acurion host' },
  }));
  return new Promise(resolve => {
    let stop = () => {};
    const timer = setTimeout(() => { stop(); resolve({ ok: false, message: 'The Acurion host did not answer within 12 seconds. Check that the bridge is running on the host.' }); }, 12000);
    stop = onValue(ref(db, `${DATA_PATHS.hostDesk}/lastCommand`), snapshot => {
      const answer = snapshot.val();
      if (answer?.id !== id) return;
      clearTimeout(timer); stop();
      resolve({ ok: answer.ok === true, message: String(answer.message || '') });
    });
  });
}

// ---------------------------------------------------------------------------------------------------------
// Dataset uploads
// ---------------------------------------------------------------------------------------------------------

const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

// The host's column review (uploadJobs/{id}/host/columns) in a steady shape: Firebase hands lists back as
// arrays or as objects with numeric keys.
export function normalizeColumns(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    datasetType: String(raw.datasetType || 'generic'), rows: Number(raw.rows) || 0, rowsEstimated: !!raw.rowsEstimated,
    columns: list(raw.columns).filter(c => c && c.name).map(c => ({ name: String(c.name), kind: String(c.kind || 'text'), distinct: Number(c.distinct) || 0, samples: list(c.samples).map(String), dateOrder: c.dateOrder ? String(c.dateOrder) : null })),
    suggested: Object.fromEntries(Object.entries(raw.suggested || {}).filter(([, column]) => typeof column === 'string' && column)),
    fixed: list(raw.fixed).map(String), missing: list(raw.missing).map(String),
    alternatives: Object.fromEntries(Object.entries(raw.alternatives || {}).map(([field, names]) => [field, list(names).map(String)])),
    warnings: list(raw.warnings).map(String), message: raw.message ? String(raw.message) : '', askedAt: Number(raw.askedAt) || null,
  };
}

export function normalizeJob(id, job, myUid) {
  const host = job?.host || {};
  return {
    id, fileName: String(job?.fileName || 'Dataset'), bytes: Number(job?.bytes) || 0, byName: String(job?.byName || 'An investigator'),
    mine: !!myUid && job?.by === myUid, createdAt: Number(job?.createdAt) || null, status: String(job?.status || 'uploading'),
    progress: host.progress || null, summary: host.summary || null, error: host.error || null,
    finishedAt: Number(host.finishedAt) || null, columns: normalizeColumns(host.columns),
    mapping: job?.mapping && typeof job.mapping === 'object' ? job.mapping : null,
  };
}

// The 20 most recent uploads, newest first.
export function watchUploads(listener) {
  if (preview) { let stop = () => {}; preview.then(module => { stop = module.watchPreviewUploads(listener); }); return () => stop(); }
  if (DEMO_MODE) { listener([]); return () => {}; }
  let stop = () => {}, cancelled = false;
  withTimeout(requireSession()).then(user => {
    if (cancelled) return;
    stop = onValue(query(ref(db, DATA_PATHS.uploadJobs), orderByChild('createdAt'), limitToLast(20)), snapshot => {
      const jobs = Object.entries(snapshot.val() || {}).map(([id, job]) => normalizeJob(id, job, user.uid));
      listener(jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, () => listener([]));
  }).catch(() => listener([]));
  return () => { cancelled = true; stop(); };
}

export function watchUpload(id, listener) {
  if (preview) { let stop = () => {}; preview.then(module => { stop = module.watchPreviewUpload(id, listener); }); return () => stop(); }
  let stop = () => {}, cancelled = false;
  withTimeout(requireSession()).then(user => {
    if (cancelled) return;
    stop = onValue(ref(db, `${DATA_PATHS.uploadJobs}/${id}`), snapshot => { if (snapshot.exists()) listener(normalizeJob(id, snapshot.val(), user.uid)); });
  });
  return () => { cancelled = true; stop(); };
}

// Packs and sends a file. onProgress({ phase: 'packing' | 'sending', done, total }). Returns the job ID.
// `signal` (an AbortSignal) cancels it; the job is then marked cancelled so the host clears its chunks.
export async function uploadDataset(file, { columns = [], onProgress = () => {}, signal } = {}) {
  if (preview) return (await preview).previewUpload(file, { onProgress, signal });
  const user = await withTimeout(requireSession());
  onProgress({ phase: 'packing', done: 0, total: 1 });
  const packed = await packFile(new Uint8Array(await file.arrayBuffer()));
  if (signal?.aborted) throw Object.assign(new Error('Upload cancelled.'), { code: 'upload/cancelled' });
  const jobRef = push(ref(db, DATA_PATHS.uploadJobs)), id = jobRef.key;
  await withTimeout(set(jobRef, {
    by: user.uid, byName: (user.displayName || user.email?.split('@')[0] || 'Investigator').slice(0, 120),
    fileName: file.name.slice(0, 200), bytes: packed.bytes, packedBytes: packed.packedBytes, chunks: packed.chunks.length,
    sha256: packed.sha256, columns: columns.join(', ').slice(0, 4000), status: 'uploading', createdAt: serverTimestamp(),
  }));
  try {
    let done = 0;
    onProgress({ phase: 'sending', done, total: packed.chunks.length });
    // Three chunks in flight at a time: quick on a normal connection, gentle on a slow one.
    const queue = packed.chunks.map((chunk, index) => [index, chunk]);
    const worker = async () => {
      while (queue.length) {
        if (signal?.aborted) throw Object.assign(new Error('Upload cancelled.'), { code: 'upload/cancelled' });
        const [index, chunk] = queue.shift();
        await withTimeout(set(ref(db, `${DATA_PATHS.uploadFiles}/${id}/c${String(index).padStart(3, '0')}`), chunk), 60000);
        onProgress({ phase: 'sending', done: ++done, total: packed.chunks.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await withTimeout(update(ref(db, `${DATA_PATHS.uploadJobs}/${id}`), { status: 'queued' }));
    return id;
  } catch (error) {
    await update(ref(db, `${DATA_PATHS.uploadJobs}/${id}`), { status: 'cancelled' }).catch(() => {});
    throw error;
  }
}

export async function cancelUpload(id) {
  if (preview) return (await preview).previewCancel(id);
  const snapshot = await withTimeout(get(ref(db, `${DATA_PATHS.uploadJobs}/${id}/status`)));
  if (['uploading', 'queued', 'columns'].includes(snapshot.val())) await withTimeout(update(ref(db, `${DATA_PATHS.uploadJobs}/${id}`), { status: 'cancelled' }));
}

// The uploader's answer to the column review: { field: column name, or '' for "not in this file" }. The job
// goes back to the queue and the host scores the file with exactly these columns.
export async function confirmColumns(id, mapping) {
  if (preview) return (await preview).previewConfirm(id, mapping);
  const clean = Object.fromEntries(Object.entries(mapping || {}).filter(([, column]) => typeof column === 'string').map(([field, column]) => [field, column.slice(0, 200)]));
  await withTimeout(update(ref(db, `${DATA_PATHS.uploadJobs}/${id}`), Object.keys(clean).length ? { status: 'queued', mapping: clean } : { status: 'queued' }));
}

// Plain-language stage of an upload, for lists and the dialog.
export function describeUpload(job) {
  if (job.status === 'succeeded') return `${(job.summary?.alertsWritten ?? 0).toLocaleString('en-GB')} alerts from ${(job.summary?.transactions ?? 0).toLocaleString('en-GB')} transactions`;
  if (job.status === 'failed') return job.error?.message || 'The host could not analyse this file.';
  if (job.status === 'cancelled') return 'Cancelled';
  if (job.status === 'uploading') return 'Uploading';
  if (job.status === 'columns') return job.mine ? 'Confirm the columns to start the analysis' : `Waiting for ${job.byName} to confirm the columns`;
  if (job.status === 'queued') return job.columns ? 'Columns confirmed, waiting for the Acurion host' : 'Waiting for the Acurion host';
  if (job.status === 'received' && !job.columns) return 'The host is reading the columns';
  return job.progress?.note || 'Analysing on the Acurion host';
}
