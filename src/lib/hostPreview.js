// Development only (VITE_HOST_PREVIEW=true with `vite`): simulates the Acurion host so the live controls
// can be reviewed without Firebase. Never part of a production build (config.HOST_PREVIEW is false there).
// The K7 alerts follow the shape of K7's demo desk; the upload summary is a real core-model run on one day
// of IBM HI-Small (482,089 transactions), recorded on 15 Nov 2026. The column review is built from the chosen
// file's first rows the way the bridge builds it, with a small alias table standing in for the batch API.
import { packFile, inspectCsv } from './uploadPacking.js';

const ALIASES = { transaction_id: /^(transaction|txn|tx|trans)[ _-]?(id|ref)|^payment_id$|^reference/i, sender: /^(sender|from|origin|payer|source|debtor)([ _-]?(account|acct|id))?$|^nameorig$/i,
  receiver: /^(receiver|to|dest|destination|payee|beneficiary|creditor|target)([ _-]?(account|acct|id))?$|^namedest$/i, amount: /^(amount|amt|value|amount[ _]paid)$/i,
  timestamp: /^(timestamp|date[ _]?time|transaction[ _]?(date|time)|posted|booking[ _]date|date)$/i, payment_currency: /currency$/i, payment_format: /^(payment[ _]?(format|type)|type|channel)$/i,
  sender_bank: /^(from|sender)[ _]bank$/i, receiver_bank: /^(to|receiver)[ _]bank$/i, label: /laundering|fraud|label|suspicious/i };
const kindOf = values => { const v = values.filter(Boolean); if (!v.length) return 'empty'; const share = t => v.filter(t).length / v.length;
  if (share(x => /^[-+]?[\d,]*\.?\d+$/.test(x.replace(/[\s$€£]/g, ''))) >= .9) return 'number'; if (share(x => /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})([ T].*)?$/.test(x)) >= .9) return 'date'; if (share(x => /^\d{1,2}:\d{2}/.test(x)) >= .9) return 'time'; return 'text'; };
function previewReview(text) {
  const { columns: header, delimiter } = inspectCsv(text.slice(0, 65536), text.length);
  const rows = text.split(/\r?\n/).slice(1, 201).filter(l => l.trim()).map(l => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '')));
  const orderOf = values => { const parts = values.map(v => v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?=$|[ T])/)).filter(Boolean); if (!parts.length) return null; if (parts.some(p => +p[1] > 12)) return 'day_first'; if (parts.some(p => +p[2] > 12)) return 'month_first'; return 'ambiguous'; };
  const columns = header.map((name, i) => { const values = rows.map(r => r[i] || ''), kept = values.filter(Boolean), kind = kindOf(values); return { name, kind, distinct: kept.length ? Math.round(new Set(kept).size / kept.length * 100) / 100 : 0, samples: [...new Set(kept)].slice(0, 3).map(s => s.slice(0, 40)), dateOrder: kind === 'date' ? orderOf(kept) : null }; });
  const ibm = header.includes('From Bank') && header.includes('To Bank') && header.includes('Amount Paid');
  const suggested = {}, used = new Set();
  if (ibm) Object.assign(suggested, { sender: 'From Bank + Account', receiver: 'To Bank + Account.1', amount: 'Amount Paid', timestamp: 'Timestamp', amount_received: 'Amount Received', payment_currency: 'Payment Currency', receiving_currency: 'Receiving Currency', payment_format: 'Payment Format', sender_bank: 'From Bank', receiver_bank: 'To Bank', label: 'Is Laundering' });
  else for (const [field, test] of Object.entries(ALIASES)) { const hit = header.find(c => !used.has(c) && test.test(c)); if (hit) { suggested[field] = hit; used.add(hit); } }
  const missing = ['sender', 'receiver', 'amount', 'timestamp'].filter(f => !suggested[f]);
  return { datasetType: ibm ? 'ibm_aml' : 'generic', rows: rows.length, rowsEstimated: false, columns, suggested, fixed: ibm ? ['sender', 'receiver', 'amount', 'timestamp'] : [], missing, alternatives: {}, warnings: [], message: '', askedAt: Date.now() };
}

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
const step = (job, ms, change) => new Promise(r => setTimeout(() => { if (job.status !== 'cancelled') { Object.assign(job, change); pushJobs(); } r(); }, ms));
export async function previewUpload(file, { onProgress, signal }) {
  onProgress({ phase: 'packing', done: 0, total: 1 });
  const bytes = new Uint8Array(await file.arrayBuffer()), packed = await packFile(bytes);
  const id = `-Opreview${Date.now()}`;
  jobs.set(id, { id, fileName: file.name, bytes: packed.bytes, byName: 'Demo analyst', mine: true, createdAt: Date.now(), status: 'uploading', progress: null, summary: null, error: null, finishedAt: null, columns: null, mapping: null });
  pushJobs();
  for (let i = 1; i <= packed.chunks.length; i++) {
    if (signal?.aborted) { jobs.get(id).status = 'cancelled'; pushJobs(); throw Object.assign(new Error('Upload cancelled.'), { code: 'upload/cancelled' }); }
    await new Promise(r => setTimeout(r, 120));
    onProgress({ phase: 'sending', done: i, total: packed.chunks.length });
  }
  const job = jobs.get(id);
  job.status = 'queued'; pushJobs();
  (async () => {
    await step(job, 1500, { status: 'received', progress: { note: 'Received by the Acurion host' } });
    await step(job, 1400, { status: 'columns', columns: previewReview(new TextDecoder().decode(bytes.subarray(0, 1 << 20))), progress: { note: 'Waiting for the uploader to confirm the columns' } });
  })();
  return id;
}
export async function previewConfirm(id, mapping) {
  const job = jobs.get(id);
  if (!job || job.status !== 'columns') return;
  await new Promise(r => setTimeout(r, 300));
  Object.assign(job, { status: 'queued', mapping: Object.keys(mapping || {}).length ? mapping : null }); pushJobs();
  (async () => {
    await step(job, 1500, { status: 'received', progress: { note: 'Received by the Acurion host' } });
    await step(job, 1200, { status: 'analysing', progress: { done: 1, total: 3, note: 'Analysing 482,089 transactions' } });
    await step(job, 4000, { progress: { done: 2, total: 3, note: 'Finding laundering networks' } });
    await step(job, 2500, { status: 'succeeded', finishedAt: Date.now(), progress: { note: 'Finished' }, summary: {
      transactions: 482089, accounts: 224616, highRisk: 49, mediumRisk: 9864, highRiskAccounts: 73, networks: 29, alertsWritten: 99, networksWritten: 15, transactionsWritten: 172,
      networkPatterns: [{ pattern: 'PASS-THROUGH', count: 10 }, { pattern: 'SIMPLE', count: 7 }, { pattern: 'FAN-IN', count: 5 }, { pattern: 'CHAIN', count: 3 }, { pattern: 'ROUND-TRIP', count: 2 }, { pattern: 'FAN-OUT', count: 2 }],
      model: 'Acurion core model (acurion-risk-core)', trust: 'good', start: '2022-09-06T00:00:00Z', end: '2022-09-06T23:59:00Z',
      warnings: ['The file covers only 24 hours. The model relies on each account’s earlier activity, so it misses more money laundering in short files. Include at least 7 days of transactions when possible.'],
      evaluation: { labelColumn: 'Is Laundering', positives: 531, precision: .9388, recall: .0866, averagePrecision: .2569 } } });
  })();
}
export function previewCancel(id) { const job = jobs.get(id); if (job && ['uploading', 'queued', 'columns'].includes(job.status)) { job.status = 'cancelled'; pushJobs(); } }

// Two model alerts as K7 and an upload would write them, so the alert drawer can be checked without a host.
export function previewAlerts() {
  const now = Date.now();
  return [
    { key: 'k7-al_preview0001', data: { alertId: 'al_preview0001', accountId: '16975:80634E1EEF', riskScore: 0.962, severity: 'critical', status: 'open', transactionId: 'tx-preview-1', timestamp: new Date(now - 3600e3).toISOString(),
      modelVersion: 'Acurion K7 (real-time laundering model, rt/core)', sourceDataset: 'Acurion K7 live (HI-Large, simulated IBM AML data)', decision: 'flag', featureWindow: 'the 14 days before the transfer',
      reason: 'Receiver passed almost the same amount on within 72 hours; First payment from this sender to this receiver',
      shapExplanation: { method: 'K7 ensemble', topFeatures: [{ feature: 'Receiver passed almost the same amount on within 72 hours', impact: 1.42 }, { feature: 'First payment from this sender to this receiver', impact: 0.88 }, { feature: 'Amount far above the sender’s usual payments', impact: 0.61 }, { feature: 'Sender’s account is a long-standing customer', impact: -0.35 }] } } },
    { key: 'up-NkPreviewJob1-001', data: { alertId: 'UP-ewJob1-001', accountId: 'ACC-10293', riskScore: 0.874, severity: 'high', status: 'investigating', owner: 'A. Reddy', transactionId: 'P-1004', timestamp: new Date(now - 7200e3).toISOString(),
      modelVersion: 'acurion-risk-core', sourceDataset: 'Upload · bank_export.csv', uploadId: 'NkPreviewJob1', networkId: 'up-NkPreviewJob1-net-01', decision: 'flag',
      reasons: ['Money passed through within a day', 'Part of a fan-in network', 'Round amount just under a reporting limit'] } },
  ];
}
