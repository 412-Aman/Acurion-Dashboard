// The upload flow's state, outside any one view: choose a CSV, send it, confirm the columns, follow the scan,
// show the results. The header pill (src/islands/upload-panel.tsx) draws it and can shrink back to a pill
// without losing an upload in progress. Nothing is scored before the uploader has confirmed the columns.
import { inspectCsv, uploadProblem, COLUMN_FIELDS, guessColumns, reviewMapping, reviewProblem } from './uploadPacking.js';
import { uploadDataset, watchUpload, cancelUpload, confirmColumns } from './hostDesk.js';
import { DEMO_MODE, HOST_PREVIEW } from './config.js';

const ACTIVE = ['sending', 'analysing', 'columns'];
let state = { step: 'choose' }, stopJob = () => {}, controller = null;
const listeners = new Set(), openers = new Set();
let pending = null;
const set = next => { state = next; for (const listener of listeners) listener(); };

export const uploadState = () => state;
export function subscribeUpload(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export const uploadBusy = () => ACTIVE.includes(state.step);

// Ask the pill to open the upload panel (optionally on one job). Requests made before the pill loads wait.
export function requestUpload(jobId) {
  pending = { jobId };
  for (const open of openers) open(jobId);
  if (openers.size) pending = null;
}
export function onUploadRequest(open) {
  openers.add(open);
  if (pending) { const { jobId } = pending; pending = null; open(jobId); }
  return () => openers.delete(open);
}

// Decide what the panel shows when it opens.
export function beginUpload(jobId) {
  if (DEMO_MODE && !HOST_PREVIEW) { set({ step: 'signin' }); return; }
  if (jobId) { if (state.jobId !== jobId || !ACTIVE.concat('done', 'failed').includes(state.step)) { set({ step: 'analysing', jobId }); follow(jobId); } return; }
  if (!ACTIVE.includes(state.step)) set({ step: 'choose' });
}

export async function chooseFile(file) {
  if (!file) return;
  const sample = await file.slice(0, 65536).text().catch(() => '');
  const inspection = inspectCsv(sample, file.size);
  set({ step: 'choose', file, inspection, problem: uploadProblem(file, inspection) });
}
export const clearFile = () => set({ step: 'choose' });

function follow(jobId) {
  stopJob();
  stopJob = watchUpload(jobId, job => {
    const step = job.status === 'succeeded' ? 'done' : job.status === 'failed' || job.status === 'cancelled' ? 'failed' : job.status === 'columns' && job.columns ? 'columns' : 'analysing';
    if (state.jobId !== jobId) return;
    if (step === 'columns' && (state.step !== 'columns' || state.askedAt !== job.columns.askedAt)) {
      // A fresh review: start from what the scanner matched, plus a guess for anything required it could not.
      const guessed = guessColumns(job.columns.columns, job.columns.suggested), picks = {};
      for (const { id } of COLUMN_FIELDS) if (!job.columns.fixed.includes(id)) picks[id] = job.columns.suggested[id] || guessed[id] || '';
      set({ step, jobId, job, picks, guessed, askedAt: job.columns.askedAt });
    } else set({ ...state, jobId, job, step, confirming: step === 'columns' ? state.confirming : false });
    if (step === 'done' || step === 'failed') { stopJob(); stopJob = () => {}; }
  });
}

export async function sendFile() {
  const { file, inspection, problem } = state;
  if (!file || problem) return;
  controller = new AbortController();
  set({ step: 'sending', file, progress: { phase: 'packing', done: 0, total: 1 } });
  try {
    const jobId = await uploadDataset(file, { columns: inspection?.columns || [], signal: controller.signal,
      onProgress: progress => { if (state.step === 'sending' && state.file === file) set({ ...state, progress }); } });
    // If the panel moved on to another upload meanwhile, this one is still listed under Transactions.
    if (state.step !== 'sending' || state.file !== file) return;
    set({ step: 'analysing', jobId, file });
    follow(jobId);
  } catch (error) {
    if (state.step !== 'sending' || state.file !== file) return;
    set(error.code === 'upload/cancelled' ? { step: 'choose' } : { step: 'failed', file, error: error.message || 'The upload could not be sent. Check your connection and try again.' });
  } finally { controller = null; }
}
export const abortSend = () => controller?.abort();

// Share of the file sent so far (0 to 1), for the progress ring.
export function sentShare(progress) {
  if (!progress) return 0;
  return progress.phase === 'packing' ? 0.04 : 0.04 + 0.96 * (progress.done / Math.max(1, progress.total));
}

export function pickColumn(field, column) {
  if (state.step !== 'columns') return;
  set({ ...state, picks: { ...state.picks, [field]: column }, confirmError: '' });
}

export async function confirmPicks() {
  const { jobId, job, picks } = state;
  if (state.step !== 'columns' || reviewProblem(picks, job.columns.fixed)) return;
  set({ ...state, confirming: true, confirmError: '' });
  try {
    await confirmColumns(jobId, reviewMapping(picks, job.columns.suggested, job.columns.fixed, job.columns.columns));
    if (state.jobId === jobId && state.step === 'columns') set({ ...state, step: 'analysing', confirming: false, job: { ...job, status: 'queued' } });
  } catch {
    set({ ...state, confirming: false, confirmError: 'Your choices could not be saved. Check your connection and try again.' });
  }
}

export const cancelJob = () => { if (state.jobId) cancelUpload(state.jobId).catch(() => {}); };
export function startOver() { stopJob(); stopJob = () => {}; set({ step: 'choose' }); }
