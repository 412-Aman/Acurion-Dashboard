// Development only (VITE_HOST_PREVIEW=true with `vite`): simulates the Acurion host so the live controls
// can be reviewed without Firebase. Never part of a production build (config.HOST_PREVIEW is false there).
// The K7 alerts follow the shape of K7's demo desk; the upload summary is a real core-model run on one day
// of IBM HI-Small (482,089 transactions), recorded on 15 Nov 2026.
import { packFile } from './uploadPacking.js';

const reasons = [
  'First payment from this sender to this receiver; Receiver has been paid by 7 different accounts so far',
  'Receiver passed almost the same amount on within 72 hours; First payment from this sender to this receiver',
  'Sender made 41 more payments within 6 hours (fan-out continues); Sender has paid 30 different accounts so far',
  'Receiver received 6 transfers that investigators confirmed as laundering; Amount far above this sender’s usual payment',
];
const status = { updatedAt: Date.now(), bridge: 'preview', uploads: { state: 'ready' },
  k7: { state: 'getting ready', sent: 0, total: 213995, alerts: 0, watch: 0, speed: null, model: 'Acurion K7 (real-time laundering model, rt/core)', dataset: 'HI-Large', recent: [] } };
const statusListeners = new Set(), uploadListeners = new Set(), jobs = new Map();
const push = () => { status.updatedAt = Date.now(); for (const l of statusListeners) l(structuredClone(status)); };
let clock = Date.parse('2022-10-26T21:00:00Z'), nextAlertAt = 0, alertNumber = 0;
setTimeout(() => { status.k7.state = 'ready'; push(); }, 2500);
setInterval(() => {
  const k7 = status.k7;
  if (k7.state === 'running') {
    k7.speed = 110.8; k7.sent = Math.min(k7.total, k7.sent + 111); clock += 34000; k7.payment_time = new Date(clock).toISOString().replace('.000', '');
    k7.watch += Math.random() < .35 ? 1 : 0;
    if (Date.now() >= nextAlertAt) {
      alertNumber++; nextAlertAt = Date.now() + 9000 + Math.random() * 6000; k7.alerts++;
      k7.recent.unshift({ alertId: `al_preview${String(alertNumber).padStart(4, '0')}`, accountId: `${16938 + alertNumber * 37}:80634E${(alertNumber * 7919).toString(16).toUpperCase().padStart(3, '0')}`,
        riskScore: Math.round((.9 + Math.random() * .09) * 10000) / 10000, severity: 'high', timestamp: new Date(clock - 60000).toISOString().replace('.000', ''),
        reason: `K7's alert list: ${reasons[alertNumber % reasons.length]}` });
      k7.recent = k7.recent.slice(0, 20);
    }
    if (k7.sent >= k7.total) { k7.state = 'finished'; k7.speed = null; }
  }
  push();
}, 1000);

export function watchPreviewStatus(listener) { statusListeners.add(listener); listener(structuredClone(status)); return () => statusListeners.delete(listener); }
export async function previewCommand(action) {
  await new Promise(r => setTimeout(r, 700));
  if (action === 'start') { status.k7.state = 'running'; nextAlertAt = Date.now() + 5000; } else { status.k7.state = 'paused'; status.k7.speed = null; }
  push();
  return { ok: true, message: action === 'start' ? 'K7 is running.' : 'K7 is paused.' };
}

const listJobs = () => [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(j => structuredClone(j));
const pushJobs = () => { for (const l of uploadListeners) l(listJobs()); };
export function watchPreviewUploads(listener) { uploadListeners.add(listener); listener(listJobs()); return () => uploadListeners.delete(listener); }
export function watchPreviewUpload(id, listener) {
  const relay = list => { const job = list.find(j => j.id === id); if (job) listener(job); };
  uploadListeners.add(relay); relay(listJobs()); return () => uploadListeners.delete(relay);
}
export async function previewUpload(file, { onProgress, signal }) {
  onProgress({ phase: 'packing', done: 0, total: 1 });
  const packed = await packFile(new Uint8Array(await file.arrayBuffer()));
  const id = `-Opreview${Date.now()}`;
  jobs.set(id, { id, fileName: file.name, bytes: packed.bytes, byName: 'Demo analyst', mine: true, createdAt: Date.now(), status: 'uploading', progress: null, summary: null, error: null, finishedAt: null });
  pushJobs();
  for (let i = 1; i <= packed.chunks.length; i++) {
    if (signal?.aborted) { jobs.get(id).status = 'cancelled'; pushJobs(); throw Object.assign(new Error('Upload cancelled.'), { code: 'upload/cancelled' }); }
    await new Promise(r => setTimeout(r, 120));
    onProgress({ phase: 'sending', done: i, total: packed.chunks.length });
  }
  const job = jobs.get(id), step = (ms, change) => new Promise(r => setTimeout(() => { Object.assign(job, change); pushJobs(); r(); }, ms));
  job.status = 'queued'; pushJobs();
  (async () => {
    await step(1500, { status: 'received', progress: { note: 'Received by the Acurion host' } });
    await step(1200, { status: 'analysing', progress: { done: 1, total: 3, note: 'Analysing 482,089 transactions' } });
    await step(4000, { progress: { done: 2, total: 3, note: 'Finding laundering networks' } });
    await step(2500, { status: 'succeeded', finishedAt: Date.now(), progress: { note: 'Finished' }, summary: {
      transactions: 482089, accounts: 224616, highRisk: 49, mediumRisk: 9864, highRiskAccounts: 73, networks: 29, alertsWritten: 99, networksWritten: 15, transactionsWritten: 172,
      networkPatterns: [{ pattern: 'PASS-THROUGH', count: 10 }, { pattern: 'SIMPLE', count: 7 }, { pattern: 'FAN-IN', count: 5 }, { pattern: 'CHAIN', count: 3 }, { pattern: 'ROUND-TRIP', count: 2 }, { pattern: 'FAN-OUT', count: 2 }],
      model: 'Acurion core model (acurion-risk-core)', trust: 'good', start: '2022-09-06T00:00:00Z', end: '2022-09-06T23:59:00Z',
      warnings: ['The file covers only 24 hours. The model relies on each account’s earlier activity, so it misses more money laundering in short files. Include at least 7 days of transactions when possible.'],
      evaluation: { labelColumn: 'Is Laundering', positives: 531, precision: .9388, recall: .0866, averagePrecision: .2569 } } });
  })();
  return id;
}
export function previewCancel(id) { const job = jobs.get(id); if (job && ['uploading', 'queued'].includes(job.status)) { job.status = 'cancelled'; pushJobs(); } }
