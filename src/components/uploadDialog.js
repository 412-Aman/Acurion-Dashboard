// Upload a dataset: choose a CSV, send it (compressed) to the Acurion host through Firebase, follow the
// analysis, then open the alerts and networks it produced. Each step fits the window; the primary action
// stays in the footer. Opened by any [data-open-upload] button or the `acurion:open-upload` event.
import { escapeHTML as esc, icon } from './icons.js';
import { DEMO_MODE, HOST_PREVIEW, exitDemo } from '../lib/config.js';
import { inspectCsv, uploadProblem, formatBytes, MAX_UPLOAD_BYTES } from '../lib/uploadPacking.js';
import { uploadDataset, watchUpload, cancelUpload, describeUpload, watchHost } from '../lib/hostDesk.js';
import { patternName } from './modelExplanation.js';
import { formatDateTime } from '../lib/utils.js';

const FORMATS = { ibm_aml: 'IBM AML layout', paysim: 'PaySim layout', generic: 'Bank export', custom: 'Bank export' };
let dialog, host = null, stopJob = () => {}, controller = null;
let state = { step: 'choose' };
const signedOut = () => DEMO_MODE && !HOST_PREVIEW;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'upload-dialog';
  dialog.setAttribute('aria-labelledby', 'upload-title');
  document.body.append(dialog);
  dialog.addEventListener('close', () => { stopJob(); stopJob = () => {}; });
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('change', event => { if (event.target.id === 'upload-file') choose(event.target.files[0]); });
  dialog.addEventListener('dragover', event => { const zone = event.target.closest('.upload-drop'); if (zone) { event.preventDefault(); zone.dataset.over = 'true'; } });
  dialog.addEventListener('dragleave', event => { const zone = event.target.closest('.upload-drop'); if (zone) delete zone.dataset.over; });
  dialog.addEventListener('drop', event => { const zone = event.target.closest('.upload-drop'); if (!zone) return; event.preventDefault(); delete zone.dataset.over; choose(event.dataTransfer.files[0]); });
  if (!signedOut()) watchHost(status => { host = status; if (dialog.open && state.step === 'choose' && state.file) render(); });
  return dialog;
}

export function openUploadDialog(jobId) {
  ensureDialog();
  stopJob();
  if (signedOut()) state = { step: 'signin' };
  else if (jobId) { state = { step: 'analysing', jobId }; follow(jobId); }
  else if (!['sending', 'analysing'].includes(state.step) || !dialog.open) state = { step: 'choose' };
  render();
  if (!dialog.open) dialog.showModal();
}

async function choose(file) {
  if (!file) return;
  const sample = await file.slice(0, 65536).text().catch(() => '');
  const inspection = inspectCsv(sample, file.size);
  state = { step: 'choose', file, inspection, problem: uploadProblem(file, inspection) };
  render();
}

function follow(jobId) {
  stopJob();
  stopJob = watchUpload(jobId, job => {
    state = { ...state, jobId, job, step: job.status === 'succeeded' ? 'done' : job.status === 'failed' || job.status === 'cancelled' ? 'failed' : 'analysing' };
    if (dialog.open) render();
  });
}

async function send() {
  const { file, inspection } = state;
  controller = new AbortController();
  state = { step: 'sending', file, progress: { phase: 'packing', done: 0, total: 1 } };
  render();
  try {
    const jobId = await uploadDataset(file, { columns: inspection?.columns || [], signal: controller.signal, onProgress: progress => { if (state.step === 'sending') { state.progress = progress; renderProgress(); } } });
    state = { step: 'analysing', jobId, file };
    render();
    follow(jobId);
  } catch (error) {
    state = error.code === 'upload/cancelled' ? { step: 'choose' } : { step: 'failed', file, error: error.message || 'The upload could not be sent. Check your connection and try again.' };
    render();
  } finally { controller = null; }
}

function onClick(event) {
  const target = event.target.closest('[data-upload-action]');
  if (event.target === dialog) { dialog.close(); return; }   // backdrop
  if (!target) return;
  const action = target.dataset.uploadAction;
  if (action === 'close') dialog.close();
  if (action === 'send' && state.file && !state.problem) send();
  if (action === 'again') { stopJob(); state = { step: 'choose' }; render(); }
  if (action === 'clear') { state = { step: 'choose' }; render(); }
  if (action === 'abort') controller?.abort();
  if (action === 'cancel-job' && state.jobId) cancelUpload(state.jobId).catch(() => {});
  if (action === 'signin') { exitDemo(); location.href = 'login.html?next=index.html'; }
}

const stepper = active => `<ol class="upload-steps" aria-label="Upload steps">${['Choose', 'Send', 'Analyse', 'Results'].map((label, i) => `<li data-state="${i < active ? 'done' : i === active ? 'current' : 'next'}">${label}</li>`).join('')}</ol>`;
const frame = (title, lead, body, footer, active) => `<div class="upload-frame"><header class="upload-header"><div><span class="section-kicker">Upload dataset</span><h2 id="upload-title">${title}</h2>${lead ? `<p>${lead}</p>` : ''}</div><button class="icon-button" data-upload-action="close" aria-label="Close">${icon('close')}</button></header>${active == null ? '' : stepper(active)}<div class="upload-body">${body}</div><footer class="upload-footer">${footer}</footer></div>`;

function hostLine() {
  if (!host || host.connection === 'loading') return '<p class="upload-host" data-tone="neutral">Checking the Acurion host…</p>';
  if (host.connection === 'online' && host.uploads.state === 'ready') return '<p class="upload-host" data-tone="ok">The Acurion host is ready to analyse it.</p>';
  if (host.connection === 'online' && host.uploads.state === 'busy') return '<p class="upload-host" data-tone="neutral">The host is analysing another file. Yours waits its turn.</p>';
  return '<p class="upload-host" data-tone="warn">The Acurion host is offline. Your file waits in the queue and is analysed when the host reconnects.</p>';
}

function render() {
  const s = state;
  if (s.step === 'signin') {
    dialog.innerHTML = frame('Sign in to upload', 'Uploaded datasets are scored on the team’s Acurion host and shared with every investigator, so uploads need a signed-in workspace.',
      '<p class="helper">The demo workspace keeps its sample customers and rule alerts in this browser only. Sign in to upload CSV files, run Acurion K7 and review its alerts.</p>',
      '<button class="btn-ghost" data-upload-action="close">Not now</button><button class="btn-primary" data-upload-action="signin">Sign in</button>');
    return;
  }
  if (s.step === 'choose') {
    const file = s.file;
    const body = !file
      ? `<label class="upload-drop" for="upload-file"><span class="upload-drop-icon">${icon('upload', 22)}</span><strong>Drop a CSV file here, or browse</strong><small>Up to ${formatBytes(MAX_UPLOAD_BYTES)}. Columns are matched automatically: IBM AML, PaySim and most bank exports work as they are.</small><input type="file" id="upload-file" accept=".csv,text/csv"></label>
         <ul class="upload-tips"><li>Include sender, receiver, amount and time columns. Currency and bank columns help.</li><li>Seven days or more give the best results; the model learns each account’s habits from the file itself.</li><li>A column of known outcomes (for example “Is Laundering”) is used only to measure the results, never for scoring.</li></ul>`
      : `<div class="upload-file-card"><span class="upload-file-icon">${icon('reports', 20)}</span><div><strong>${esc(file.name)}</strong><small>${formatBytes(file.size)}${s.inspection?.rowsEstimate ? ` · about ${s.inspection.rowsEstimate.toLocaleString('en-GB')} rows` : ''}</small></div><button class="text-button" data-upload-action="clear">Change</button></div>
         ${s.inspection?.columns.length ? `<div class="upload-columns"><span>Columns found</span><div>${s.inspection.columns.slice(0, 12).map(c => `<code>${esc(c)}</code>`).join('')}${s.inspection.columns.length > 12 ? `<small>+${s.inspection.columns.length - 12} more</small>` : ''}</div></div>` : ''}
         ${s.problem ? `<p class="upload-problem" role="alert">${esc(s.problem)}</p>` : hostLine()}
         <p class="helper">The file is compressed in your browser, fingerprinted (SHA-256) and sent through the workspace database to the host, which deletes its copy after scoring. Results are shared with every investigator.</p>`;
    dialog.innerHTML = frame('Analyse a transactions file', 'Acurion scores every transaction and adds the strongest leads to the alert queue.', body,
      `<button class="btn-ghost" data-upload-action="close">Cancel</button><button class="btn-primary" data-upload-action="send" ${!file || s.problem ? 'disabled' : ''}>${icon('upload', 16)}Upload and analyse</button>`, 0);
    dialog.querySelector('[data-upload-action="send"]:not([disabled])')?.focus();
    return;
  }
  if (s.step === 'sending') {
    dialog.innerHTML = frame(`Sending ${esc(s.file.name)}`, 'Keep this window open until the file is sent. Analysis then continues on the host.',
      '<div class="upload-progress"><div class="upload-track"><i data-progress-bar></i></div><p data-progress-text>Compressing and fingerprinting…</p></div>',
      '<button class="btn-ghost" data-upload-action="abort">Cancel upload</button>', 1);
    renderProgress();
    return;
  }
  if (s.step === 'analysing') {
    const job = s.job, status = job?.status || 'queued';
    const order = ['queued', 'received', 'analysing'], at = Math.max(0, order.indexOf(status));
    const stages = [['Sent to the workspace', 'queued'], ['Received by the Acurion host', 'received'], [job?.progress?.note && status === 'analysing' ? job.progress.note : 'Scoring every transaction', 'analysing']];
    dialog.innerHTML = frame(`Analysing ${esc(job?.fileName || s.file?.name || 'your file')}`, 'You can close this window. The header island tells you when the results are ready.',
      `<ol class="upload-stages">${stages.map(([label], i) => `<li data-state="${i < at ? 'done' : i === at ? 'current' : 'next'}">${esc(label)}</li>`).join('')}</ol>${status === 'queued' ? hostLine() : ''}`,
      `${status === 'queued' && (job?.mine ?? true) ? '<button class="btn-ghost" data-upload-action="cancel-job">Cancel upload</button>' : ''}<button class="btn-primary" data-upload-action="close">Close</button>`, 2);
    return;
  }
  if (s.step === 'done') {
    const job = s.job, sum = job.summary || {}, n = v => Number(v || 0).toLocaleString('en-GB');
    const evaluation = sum.evaluation?.precision != null ? `<p class="upload-evaluation">This file has a column of known outcomes (“${esc(sum.evaluation.labelColumn || 'label')}”). Measured against it, ${(sum.evaluation.precision * 100).toFixed(1)}% of the high-risk alerts were laundering, and they found ${(sum.evaluation.recall * 100).toFixed(1)}% of the ${n(sum.evaluation.positives)} laundering transfers.</p>` : '';
    dialog.innerHTML = frame(`${esc(job.fileName)} is analysed`, `${n(sum.alertsWritten)} alerts are in the queue for every investigator.`,
      `<dl class="upload-summary"><div><dt>Transactions</dt><dd>${n(sum.transactions)}</dd></div><div><dt>High-risk</dt><dd>${n(sum.highRisk)}</dd></div><div><dt>Alerts added</dt><dd>${n(sum.alertsWritten)}</dd></div><div><dt>Networks</dt><dd>${n(sum.networksWritten)}${sum.networks > sum.networksWritten ? `<small> of ${n(sum.networks)}</small>` : ''}</dd></div></dl>
       ${sum.networkPatterns?.length ? `<div class="upload-patterns">${sum.networkPatterns.map(p => `<span>${esc(patternName(p.pattern))} <b>${n(p.count)}</b></span>`).join('')}</div>` : ''}
       <p class="helper">${sum.start ? `${formatDateTime(sum.start)} to ${formatDateTime(sum.end)}` : 'Dates not recorded'}${sum.datasetType ? ` · ${esc(FORMATS[sum.datasetType] || sum.datasetType)}` : ''} · Scored by ${esc(sum.model || 'the Acurion core model')}${sum.trust ? `, fit for this file: ${esc(sum.trust)}` : ''}.</p>
       ${evaluation}
       ${sum.warnings?.length ? `<ul class="upload-warnings">${sum.warnings.slice(0, 2).map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`,
      `<button class="btn-ghost" data-upload-action="again">Upload another</button>${sum.networksWritten ? `<a class="btn-ghost" href="graph.html?upload=${encodeURIComponent(job.id)}">${icon('graph', 16)}View networks</a>` : ''}<a class="btn-primary" href="alerts.html?source=${encodeURIComponent(job.id)}">${icon('alerts', 16)}Open ${n(sum.alertsWritten)} alerts</a>`, 3);
    return;
  }
  const message = s.job ? describeUpload(s.job) : s.error;
  dialog.innerHTML = frame(s.job?.status === 'cancelled' ? 'Upload cancelled' : 'The file was not analysed', '', `<p class="upload-problem" role="alert">${esc(message || 'Something went wrong.')}</p><p class="helper">Nothing from this file was added to the workspace.</p>`,
    '<button class="btn-ghost" data-upload-action="close">Close</button><button class="btn-primary" data-upload-action="again">Try another file</button>');
}

function renderProgress() {
  const bar = dialog?.querySelector('[data-progress-bar]'), text = dialog?.querySelector('[data-progress-text]'), p = state.progress;
  if (!bar || !p) return;
  const share = p.phase === 'packing' ? 0.04 : 0.04 + 0.96 * (p.done / Math.max(1, p.total));
  bar.style.width = `${share * 100}%`;
  text.textContent = p.phase === 'packing' ? 'Compressing and fingerprinting…' : `Sending part ${Math.min(p.done + 1, p.total)} of ${p.total}`;
}

export function installUploadDialog() {
  document.addEventListener('click', event => { const trigger = event.target.closest('[data-open-upload]'); if (trigger) { event.preventDefault(); openUploadDialog(trigger.dataset.openUpload || undefined); } });
  document.addEventListener('acurion:open-upload', event => openUploadDialog(event.detail?.jobId));
}
