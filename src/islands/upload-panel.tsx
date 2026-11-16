// The upload flow inside the header pill: drop a file, watch it go, check the columns, watch the scan, see what
// it found. One plain line per step; the detail sits behind "More info". State lives in lib/uploadFlow.js, so
// the pill can shrink back while a file is sent or scanned and pick up exactly where it was.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { uploadState, subscribeUpload, chooseFile, clearFile, sendFile, abortSend, sentShare, pickColumn, confirmPicks, cancelJob, startOver } from '../lib/uploadFlow.js';
import { COLUMN_FIELDS, reviewProblem, dateOrderNeeded, formatBytes, MAX_UPLOAD_BYTES } from '../lib/uploadPacking.js';
import { describeUpload } from '../lib/hostDesk.js';
import { exitDemo } from '../lib/config.js';
import { infoButton } from '../components/infoPop.js';
import { escapeHTML as esc } from '../components/icons.js';
import { patternName } from '../components/modelExplanation.js';
import { formatDateTime } from '../lib/utils.js';

const FORMATS: Record<string, string> = { ibm_aml: 'IBM AML layout', paysim: 'PaySim layout' };
const STEPS = ['File', 'Columns', 'Scan', 'Results'];
const n = (value: unknown) => Number(value || 0).toLocaleString('en-GB');

const svg = (path: ReactNode, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
const ICONS: Record<string, ReactNode> = {
  upload: <><path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  sender: <><circle cx="8" cy="12" r="4" /><path d="M13 12h8m-3-3 3 3-3 3" /></>,
  receiver: <><circle cx="16" cy="12" r="4" /><path d="M3 12h8m-3-3 3 3-3 3" /></>,
  amount: <><ellipse cx="12" cy="6.5" rx="7" ry="2.5" /><path d="M5 6.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5M5 11.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" /></>,
  timestamp: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></>,
  transaction_id: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  ask: <><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4.1" /><path d="M12 18.3v.2" /></>,
  need: <path d="M12 6.5v7M12 17.3v.2" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  alerts: <><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z" /><path d="M10 21h4" /></>,
  graph: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="10" cy="18" r="2.5" /><path d="m8.2 7 7.4.7M7 8.3l2.2 7.4M16.4 10l-4.6 6" /></>,
  warn: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.2" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
};
const Icon = ({ name, size }: { name: string; size?: number }) => svg(ICONS[name] || ICONS.file, size);
const Info = ({ html, title, label }: { html: string; title?: string; label?: string }) =>
  <span className="info-slot" dangerouslySetInnerHTML={{ __html: infoButton(html, { title, label }) }} />;

// Numbers count up once when they first appear (instantly with reduced motion).
function useCountUp(target: number) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced || !target) { setValue(target); return; }
    let frame = 0; const start = performance.now(), duration = 900;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / duration); setValue(Math.round(target * (1 - Math.pow(1 - t, 3)))); if (t < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return value;
}
const CountUp = ({ value }: { value: number }) => <>{useCountUp(value).toLocaleString('en-GB')}</>;

function Steps({ at }: { at: number }) {
  return <ol className="up-steps" aria-label="Upload steps">{STEPS.map((label, i) =>
    <li key={label} data-state={i < at ? 'done' : i === at ? 'current' : 'next'} aria-current={i === at ? 'step' : undefined}>
      <span className="up-step-dot">{i < at ? <Icon name="check" size={12} /> : i + 1}</span><span>{label}</span>
    </li>)}</ol>;
}

function Ring({ share, children }: { share: number; children: ReactNode }) {
  const r = 46, c = 2 * Math.PI * r;
  return <div className="up-ring" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Sent">
    <svg viewBox="0 0 108 108" aria-hidden="true"><circle cx="54" cy="54" r={r} className="up-ring-track" /><circle cx="54" cy="54" r={r} className="up-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} /></svg>
    <div className="up-ring-label">{children}</div>
  </div>;
}

function Scanner({ host }: { host: any }) {
  const [tone, text] = !host || host.connection === 'loading' ? ['neutral', 'Checking the scanner…']
    : host.connection === 'online' && host.uploads.state === 'ready' ? ['ok', 'Scanner ready']
    : host.connection === 'online' && host.uploads.state === 'busy' ? ['neutral', 'Scanner busy with another file. Yours is next.']
    : ['warn', 'Scanner offline. Your file waits in line until it is back.'];
  return <p className="up-scanner" data-tone={tone}><i aria-hidden="true" />{text}</p>;
}

// Where a column came from: matched by name, a guess to check, a gap to fill.
function statusOf(s: any, field: string): ['matched' | 'check' | 'needed' | 'chosen' | 'none' | 'fixed', string] {
  const { suggested, fixed } = s.job.columns, column = s.picks[field], required = COLUMN_FIELDS.find(f => f.id === field)!.required;
  if (fixed.includes(field)) return ['fixed', 'Set by the file layout'];
  if (!column) return required ? ['needed', 'Choose a column'] : ['none', 'Not in this file'];
  if (suggested[field] === column) return ['matched', 'Matched by name'];
  if (s.guessed[field] === column) return ['check', 'Our best guess, please check'];
  return ['chosen', 'Your choice'];
}

function ColumnPicker({ s, field }: { s: any; field: (typeof COLUMN_FIELDS)[number] }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { columns, fixed, suggested } = s.job.columns, value = s.picks[field.id] || '';
  const [tone, label] = statusOf(s, field.id);
  const chosen = columns.find((c: any) => c.name === value);
  if (fixed.includes(field.id)) return <div className="up-map" data-tone="fixed">
    <span className="up-map-field"><span className="up-map-icon"><Icon name={field.id in ICONS ? field.id : 'file'} /></span><strong>{field.label}</strong></span>
    <span className="up-map-fixed"><Icon name="lock" size={14} />{suggested[field.id] || 'Set by the layout'}</span>
  </div>;
  return <div className="up-map" data-tone={tone} data-open={open || undefined}>
    <span className="up-map-field"><span className="up-map-icon"><Icon name={field.id in ICONS ? field.id : 'file'} /></span><span><strong>{field.label}</strong>{field.hint ? <small>{field.hint}</small> : null}</span></span>
    <button type="button" className="up-map-pick" aria-expanded={open} aria-label={`${field.label}: ${value || 'no column'}. ${label}. Change`} onClick={() => setOpen(!open)}>
      <span className="up-map-status" data-tone={tone} title={label} aria-hidden="true"><Icon name={tone === 'matched' || tone === 'chosen' ? 'check' : tone === 'check' ? 'ask' : tone === 'needed' ? 'need' : 'close'} size={12} /></span>
      <span className="up-map-value"><strong>{value || (field.required ? 'Choose a column' : 'Not in this file')}</strong>{chosen?.samples?.length ? <small>{chosen.samples.slice(0, 2).join(', ')}</small> : tone === 'needed' ? <small>{label}</small> : null}</span>
      <Icon name="chevron" size={15} />
    </button>
    <AnimatePresence initial={false}>
      {open && <motion.div className="up-map-menu" role="listbox" aria-label={`Column for ${field.label}`}
        initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }} exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.32 }}>
        <div className="up-map-options">
          <button type="button" role="option" aria-selected={!value} onClick={() => { pickColumn(field.id, ''); setOpen(false); }}><strong>{field.required ? 'None yet' : 'Not in this file'}</strong></button>
          {columns.map((c: any) => <button type="button" role="option" key={c.name} aria-selected={c.name === value} onClick={() => { pickColumn(field.id, c.name); setOpen(false); }}>
            <strong>{c.name}</strong>{c.samples?.length ? <small>{c.samples.slice(0, 3).join(', ')}</small> : null}</button>)}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}

function Review({ s }: { s: any }) {
  const review = s.job.columns, [moreOpen, setMoreOpen] = useState(false);
  const core = COLUMN_FIELDS.filter(f => !f.more), more = COLUMN_FIELDS.filter(f => f.more);
  const tones = core.map(f => statusOf(s, f.id)[0]);
  const count = (t: string) => tones.filter(x => x === t).length;
  const known = FORMATS[review.datasetType];
  const needsOrder = dateOrderNeeded(review.columns, s.picks.timestamp);
  const order = s.picks.date_order === 'month_first' ? 'month_first' : 'day_first';
  const problem = reviewProblem(s.picks, review.fixed);
  const chosenMore = more.filter(f => s.picks[f.id]).length;
  return <>
    <div className="up-tally">
      {known ? <span data-tone="matched"><Icon name="check" size={13} />{known} recognised</span> : <>
        {count('matched') + count('chosen') ? <span data-tone="matched"><Icon name="check" size={13} />{count('matched') + count('chosen')} ready</span> : null}
        {count('check') ? <span data-tone="check"><Icon name="ask" size={13} />{count('check')} to check</span> : null}
        {count('needed') ? <span data-tone="needed"><Icon name="need" size={13} />{count('needed')} missing</span> : null}
      </>}
      <Info title="Checking columns" html={`<p>Acurion matched your file’s columns to what it needs by their names. Orange ones are our best guesses. Nothing is scanned until you confirm.</p><p>${esc(n(review.rows))} rows${review.rowsEstimated ? ' (about)' : ''}, ${review.columns.length} columns.</p>${review.warnings.length ? `<ul>${review.warnings.slice(0, 3).map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`} />
    </div>
    {review.message ? <p className="up-problem" role="alert">{review.message}</p> : null}
    <div className="up-maps">{core.map(f => <ColumnPicker key={f.id} s={s} field={f} />)}</div>
    {needsOrder ? <div className="up-order" role="radiogroup" aria-label="Date order">
      <span>Dates like <b>03/09</b> mean</span>
      <div>{([['day_first', '3 September'], ['month_first', '9 March']] as const).map(([value, text]) =>
        <button key={value} type="button" role="radio" aria-checked={order === value} onClick={() => pickColumn('date_order', value)}>{text}</button>)}</div>
    </div> : null}
    <button type="button" className="up-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
      <span>More columns{chosenMore ? ` · ${chosenMore} set` : ''}</span><small>Currency, banks, payment type, known outcome</small><Icon name="chevron" size={15} />
    </button>
    <AnimatePresence initial={false}>
      {moreOpen && <motion.div className="up-maps" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.34 }} style={{ overflow: 'hidden' }}>
        {more.map(f => <ColumnPicker key={f.id} s={s} field={f} />)}
      </motion.div>}
    </AnimatePresence>
    {problem || s.confirmError ? <p className="up-problem" role="alert">{s.confirmError || problem}</p> : null}
  </>;
}

function ScanStages({ status }: { status: string }) {
  const at = Math.max(0, ['queued', 'received', 'analysing'].indexOf(status));
  return <ol className="up-stages">{['In line', 'Received', 'Scanning'].map((label, i) =>
    <li key={label} data-state={i < at ? 'done' : i === at ? 'current' : 'next'}><span className="up-stage-node">{i < at ? <Icon name="check" size={13} /> : null}</span>{label}</li>)}</ol>;
}

function Results({ job }: { job: any }) {
  const sum = job.summary || {}, ev = sum.evaluation;
  const precision = ev?.precision != null ? Math.round(ev.precision * 1000) / 10 : null;
  const details = `<dl class="info-facts">${sum.start ? `<div><dt>Covers</dt><dd>${esc(formatDateTime(sum.start))} to ${esc(formatDateTime(sum.end))}</dd></div>` : ''}<div><dt>Scored by</dt><dd>${esc(sum.model || 'the Acurion core model')}</dd></div>${sum.trust ? `<div><dt>Fit for this file</dt><dd>${esc(sum.trust)}</dd></div>` : ''}${ev?.recall != null ? `<div><dt>Laundering found</dt><dd>${(ev.recall * 100).toFixed(1)}% of ${esc(n(ev.positives))} known cases (“${esc(ev.labelColumn || 'label')}” column)</dd></div>` : ''}</dl>${sum.warnings?.length ? `<ul>${sum.warnings.slice(0, 3).map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  return <>
    <div className="up-hero"><strong><CountUp value={Number(sum.alertsWritten || 0)} /></strong><span>new alerts in the queue</span></div>
    <dl className="up-tiles">
      <div><dt>Payments checked</dt><dd><CountUp value={Number(sum.transactions || 0)} /></dd></div>
      <div><dt>High risk</dt><dd data-tone="alert"><CountUp value={Number(sum.highRisk || 0)} /></dd></div>
      <div><dt>Networks</dt><dd><CountUp value={Number(sum.networksWritten || 0)} /></dd></div>
    </dl>
    {sum.networkPatterns?.length ? <div className="up-patterns">{sum.networkPatterns.map((p: any) => <span key={p.pattern}>{patternName(p.pattern)} <b>{n(p.count)}</b></span>)}</div> : null}
    {precision != null ? <div className="up-meter"><div className="up-meter-head"><span>{precision}% of high-risk alerts were real laundering</span></div><div className="up-meter-track"><motion.i initial={{ width: 0 }} animate={{ width: `${precision}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.9, delay: 0.2 }} /></div></div> : null}
    <div className="up-foot-info"><Info title="About these results" html={details} /></div>
  </>;
}

export function UploadPanel({ host, onClose, readOnly = false }: { host: any; onClose: () => void; readOnly?: boolean }) {
  const s: any = useSyncExternalStore(subscribeUpload, uploadState);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null), primary = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, [s.step]);

  const job = s.job, status = job?.status || 'queued', reviewed = !!job?.columns;
  let at: number | null = null, kicker = 'Upload a file', title = '', body: ReactNode = null, foot: ReactNode = null;
  const keepWorking = <button ref={primary as any} type="button" className="island-button is-primary" onClick={onClose}>Keep working</button>;

  if (readOnly && s.step === 'choose') {
    title = 'Uploads need the analyst role';
    body = <div className="up-center"><span className="up-orb"><Icon name="lock" size={26} /></span><p>Your account is read-only. Ask an admin for the analyst role to upload files.</p></div>;
    foot = <button ref={primary as any} type="button" className="island-button is-primary" onClick={onClose}>Close</button>;
  } else if (s.step === 'signin') {
    title = 'Sign in to upload files';
    body = <div className="up-center"><span className="up-orb"><Icon name="lock" size={26} /></span><p>Uploads are scanned on your team’s Acurion computer and shared with your team, so they need a signed-in account.</p></div>;
    foot = <><button type="button" className="island-button" onClick={onClose}>Not now</button><button ref={primary as any} type="button" className="island-button is-primary" onClick={() => { exitDemo(); location.href = 'login.html?next=index.html'; }}>Sign in</button></>;
  } else if (s.step === 'choose') {
    at = 0; title = s.file ? 'Ready to upload' : 'Find laundering in a bank file';
    const drop = (event: React.DragEvent) => { event.preventDefault(); setOver(false); chooseFile(event.dataTransfer.files[0]); };
    body = !s.file ? <>
      <label className="up-drop" data-over={over || undefined} onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <motion.span className="up-orb" animate={over && !reduced ? { scale: 1.12, y: -4 } : { scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}><Icon name="upload" size={28} /></motion.span>
        <strong>Drop a CSV file here</strong>
        <span className="up-drop-or">or <span className="up-link">choose a file</span></span>
        <input ref={input} type="file" accept=".csv,text/csv" onChange={event => chooseFile(event.target.files?.[0])} />
      </label>
      <div className="up-needs">
        <span>It needs</span>
        {['sender', 'receiver', 'amount', 'timestamp'].map(id => <span className="up-need" key={id}><Icon name={id} size={14} />{COLUMN_FIELDS.find(f => f.id === id)!.label.replace(' and time', '')}</span>)}
        <Info title="What makes a good file" html={`<ul><li>A CSV file up to ${esc(formatBytes(MAX_UPLOAD_BYTES))}, such as a bank export or the IBM AML or PaySim data.</li><li>A week or more of payments works best: Acurion learns each account’s habits from the file itself.</li><li>A column of known outcomes (for example “Is Laundering”) is only used to measure the results.</li></ul><p>Your file is compressed and fingerprinted in this browser, sent to your team’s Acurion scanner, and deleted from it after the scan. The results are shared with your team.</p>`} />
      </div>
    </> : <>
      <div className="up-file"><span className="up-file-icon"><Icon name="file" size={20} /></span><div><strong>{s.file.name}</strong><small>{formatBytes(s.file.size)}{s.inspection?.rowsEstimate ? ` · about ${n(s.inspection.rowsEstimate)} rows` : ''}</small></div><button type="button" className="up-link" onClick={clearFile}>Change</button></div>
      {s.inspection?.columns.length ? <div className="up-cols"><span>{s.inspection.columns.length} columns found</span><div>{s.inspection.columns.slice(0, 8).map((c: string) => <code key={c}>{c}</code>)}{s.inspection.columns.length > 8 ? <small>+{s.inspection.columns.length - 8}</small> : null}</div></div> : null}
      {s.problem ? <p className="up-problem" role="alert">{s.problem}</p> : <Scanner host={host} />}
    </>;
    foot = <><button type="button" className="island-button" onClick={onClose}>Cancel</button><button ref={primary as any} type="button" className="island-button is-primary" disabled={!s.file || !!s.problem} onClick={sendFile}><Icon name="upload" size={15} />Upload</button></>;
  } else if (s.step === 'sending') {
    at = 0; title = 'Sending your file';
    const share = sentShare(s.progress);
    body = <div className="up-center"><Ring share={share}><strong>{Math.round(share * 100)}%</strong></Ring><p className="up-center-title">{s.file?.name}</p><p>{s.progress?.phase === 'packing' ? 'Packing it up…' : `Part ${Math.min(s.progress.done + 1, s.progress.total)} of ${s.progress.total}`}. Keep this page open.</p></div>;
    foot = <button ref={primary as any} type="button" className="island-button" onClick={abortSend}>Cancel upload</button>;
  } else if (s.step === 'analysing' && !reviewed) {
    at = 1; title = 'Reading your columns';
    body = <div className="up-center"><div className="up-scan" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 110}ms` }} />)}</div><p className="up-center-title">{job?.fileName || s.file?.name || 'Your file'}</p><p>Acurion is matching the columns. Then you check them.</p>{status === 'queued' ? <Scanner host={host} /> : null}</div>;
    foot = <>{status === 'queued' && (job?.mine ?? true) ? <button type="button" className="island-button" onClick={cancelJob}>Cancel upload</button> : null}{keepWorking}</>;
  } else if (s.step === 'columns' && !job.mine) {
    at = 1; title = `Waiting for ${job.byName}`;
    body = <><p className="up-lead">{job.byName} is checking the columns of {job.fileName}. It is scanned once they confirm.</p><div className="up-maps" data-readonly>{COLUMN_FIELDS.filter(f => f.required).map(f => <div className="up-map" key={f.id} data-tone="fixed"><span className="up-map-field"><span className="up-map-icon"><Icon name={f.id} /></span><strong>{f.label}</strong></span><span className="up-map-fixed">{job.columns.suggested[f.id] || 'Not matched yet'}</span></div>)}</div></>;
    foot = <button ref={primary as any} type="button" className="island-button is-primary" onClick={onClose}>Close</button>;
  } else if (s.step === 'columns') {
    at = 1; kicker = job.fileName; title = 'Check the columns';
    body = <Review s={s} />;
    const problem = reviewProblem(s.picks, job.columns.fixed);
    foot = <><button type="button" className="island-button" onClick={cancelJob}>Cancel upload</button><button ref={primary as any} type="button" className="island-button is-primary" disabled={!!problem || s.confirming} onClick={confirmPicks}>{s.confirming ? 'Starting…' : 'Looks right, scan it'}</button></>;
  } else if (s.step === 'analysing') {
    at = 2; title = 'Scanning for laundering';
    body = <div className="up-center"><span className="up-orb is-pulsing"><Icon name="graph" size={26} /></span><p className="up-center-title">{job?.fileName || s.file?.name}</p><p>{status === 'analysing' && job?.progress?.note ? job.progress.note : 'Checking every payment and the links between accounts.'}</p><ScanStages status={status} /><p className="up-hint">You can keep working. The pill tells you when it is done.</p></div>;
    foot = <>{status === 'queued' && job?.mine ? <button type="button" className="island-button" onClick={cancelJob}>Cancel upload</button> : null}{keepWorking}</>;
  } else if (s.step === 'done') {
    at = 3; kicker = job.fileName; title = 'Scan complete';
    body = <Results job={job} />;
    const sum = job.summary || {};
    foot = <><button type="button" className="island-button" onClick={startOver}>Upload another</button>{sum.networksWritten ? <a className="island-button" href={`graph.html?upload=${encodeURIComponent(job.id)}`}><Icon name="graph" size={15} />Networks</a> : null}<a ref={primary as any} className="island-button is-primary" href={`alerts.html?source=${encodeURIComponent(job.id)}`}><Icon name="alerts" size={15} />See {n(sum.alertsWritten)} alerts</a></>;
  } else {
    const cancelled = job?.status === 'cancelled';
    title = cancelled ? 'Upload cancelled' : 'This file was not scanned';
    const message = job ? describeUpload(job) : s.error;
    body = <div className="up-center"><span className="up-orb" data-tone={cancelled ? undefined : 'warn'}><Icon name={cancelled ? 'close' : 'warn'} size={26} /></span><p>{cancelled ? 'Nothing from this file was added.' : 'Nothing from this file was added. Try again, or try another file.'}</p>{!cancelled && message ? <Info title="What went wrong" label="What went wrong" html={`<p>${esc(message)}</p>`} /> : null}</div>;
    foot = <><button type="button" className="island-button" onClick={onClose}>Close</button><button ref={primary as any} type="button" className="island-button is-primary" onClick={startOver}>Try another file</button></>;
  }

  return <div className="up-panel" role="dialog" aria-modal="true" aria-labelledby="up-title" data-step={s.step}>
    <header className="up-head">
      <div><span className={`island-kicker up-kicker${kicker === 'Upload a file' ? '' : ' is-file'}`}>{kicker}</span><h2 id="up-title">{title}</h2></div>
      <button type="button" className="up-close" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
    </header>
    {at != null ? <Steps at={at} /> : null}
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={s.step} className="up-body" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(4px)' }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>{body}</motion.div>
    </AnimatePresence>
    {foot ? <footer className="up-foot">{foot}</footer> : null}
  </div>;
}
