// The header "island": a black capsule showing Acurion K7's live state. Click it and it springs open into
// a panel with progress, the newest alerts and Start / Pause. It is also the app's one place for pop-ups:
// confirmations and warnings from any page (lib/notify.js), K7's new alerts, and the whole upload flow, which
// grows out of it (upload-panel.tsx). Everything live comes from Firebase via lib/hostDesk.js.
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { watchHost, sendDeskCommand, watchUploads, describeUpload } from '../lib/hostDesk.js';
import { canControlDesk, canStart, canPause, describeK7, newRecentAlerts, formatCount, START_CONFIRMED, CONFIRM_MS } from '../lib/hostStatus.js';
import { getMyRole } from '../lib/dataService.js';
import { formatRisk, formatDateTime } from '../lib/utils.js';
import { onNotify } from '../lib/notify.js';
import { onUploadRequest, beginUpload, requestUpload, subscribeUpload, uploadState, sentShare } from '../lib/uploadFlow.js';
import { UploadPanel } from './upload-panel';

type Notice = { key: string; tone: 'alert' | 'ok' | 'warn' | 'ask' | 'info'; title: string; detail?: string; note?: string; href?: string; jobId?: string };
type Mode = 'hidden' | 'compact' | 'expanded' | 'notice' | 'upload';
const STATE_LABEL: Record<string, string> = { 'getting ready': 'Loading', ready: 'Ready', running: 'Running', paused: 'Paused', finished: 'Finished', failed: 'Needs attention', offline: 'Offline' };
const NOTICE_MS = 5200;
const ACTIVE_UPLOAD = ['uploading', 'queued', 'received', 'columns', 'analysing'];
const UPLOAD_WORD: Record<string, string> = { uploading: 'Uploading', columns: 'Check columns', queued: 'In line', received: 'Scanning', analysing: 'Scanning' };
const openUpload = (jobId?: string) => requestUpload(jobId);

function topModal(): HTMLElement | null {
  try { return ([...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')).pop() as HTMLElement) || null; } catch { return null; }
}

// The same notice, drawn in the top layer inside the open modal so it is both visible and clickable.
function FloatingNotice({ host, children, onGone }: { host: HTMLElement; children: ReactNode; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null), reduced = useReducedMotion();
  useLayoutEffect(() => {
    const node = ref.current as any;
    try { node?.showPopover?.(); } catch { /* already shown */ }
    // Keep clear of the modal: beside a side drawer, centred over the page it dims; otherwise above it, or at the bottom.
    const box = host.getBoundingClientRect(), width = node?.offsetWidth || 340;
    if (box.left >= width + 24) node.style.left = `${box.left / 2}px`;
    else if (box.top < 90) { node.style.top = 'auto'; node.style.bottom = 'max(18px, env(safe-area-inset-bottom))'; }
  }, [host]);
  useEffect(() => { const gone = () => onGone(); host.addEventListener('close', gone); return () => host.removeEventListener('close', gone); }, [host, onGone]);
  return createPortal(<motion.div ref={ref} {...{ popover: 'manual' } as any} className="island-float"
    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.9, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
    transition={reduced ? { duration: 0.12 } : { type: 'spring', bounce: 0.25, duration: 0.5 }}>{children}</motion.div>, host);
}

function MiniRing({ share }: { share: number }) {
  const c = 2 * Math.PI * 6;
  return <svg className="island-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="6" strokeDasharray={c} strokeDashoffset={c * (1 - share)} /></svg>;
}

const paymentClock = (iso: string | null) => iso && Number.isFinite(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(11, 16)} UTC` : '–';
const percent = (value: number) => `${(Math.floor(value * 1000) / 10).toFixed(1)}%`;

function UploadGlyph() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></svg>;
}

function HostIsland() {
  const [status, setStatus] = useState<any>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [role, setRole] = useState(''); // '' until the account's role is known
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone?: 'ok' }>({ text: '' });
  const [size, setSize] = useState<{ w: number; h: number; x: number } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const flow: any = useSyncExternalStore(subscribeUpload, uploadState);
  const uploadOpenRef = useRef(false);
  uploadOpenRef.current = uploadOpen;
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), measure = useRef<HTMLDivElement>(null);
  const seenAlerts = useRef<any[] | null>(null), seenJobs = useRef<Map<string, string> | null>(null);
  const timer = useRef<number | undefined>(undefined), confirmTimer = useRef<number | undefined>(undefined), hovering = useRef(false);

  // A notice raised while a modal (an alert drawer, a case) is open floats above it instead of hiding behind it.
  const [noticeHost, setNoticeHost] = useState<HTMLElement | null>(null);
  const showNotice = useCallback((next: Notice) => {
    setNoticeHost(topModal());
    setNotice(next);
    window.clearTimeout(timer.current);
    const close = () => { if (hovering.current) timer.current = window.setTimeout(close, 1200); else setNotice(null); };
    timer.current = window.setTimeout(close, NOTICE_MS);
  }, []);

  useEffect(() => {
    const stopNotify = onNotify(showNotice);
    const stopRequests = onUploadRequest((jobId?: string) => { beginUpload(jobId); setOpen(false); setNotice(null); setUploadOpen(true); });
    return () => { stopNotify(); stopRequests(); };
  }, [showNotice]);

  useEffect(() => {
    getMyRole().then(setRole).catch(() => {});
    const stopHost = watchHost((next: any) => {
      if (next.connection === 'online') {
        const fresh = newRecentAlerts(seenAlerts.current, next.k7.recent);
        seenAlerts.current = next.k7.recent;
        const first = fresh[0];
        if (first) showNotice({ key: first.alertId, tone: 'alert', title: fresh.length > 1 ? `${fresh.length} new K7 alerts` : 'New K7 alert',
          detail: `${first.accountId} · score ${formatRisk(first.riskScore)} · ${first.severity}`, note: first.reason || 'Open the alert to see K7’s reasons.',
          href: `alerts.html?alert=${encodeURIComponent(first.alertId)}` });
      }
      setStatus(next);
    });
    const stopUploads = watchUploads((jobs: any[]) => {
      const previous = seenJobs.current;
      seenJobs.current = new Map(jobs.map(job => [job.id, job.status]));
      if (previous) for (const job of jobs) {
        const before = previous.get(job.id);
        if (!job.mine || before === job.status || !before || !ACTIVE_UPLOAD.includes(before)) continue;
        // The open upload panel already shows its own job's progress.
        if (uploadOpenRef.current && (uploadState() as any).jobId === job.id) continue;
        if (job.status === 'succeeded') showNotice({ key: job.id, tone: 'ok', title: `${job.fileName} is scanned`, detail: `${formatCount(job.summary?.alertsWritten)} new alerts`,
          note: `${formatCount(job.summary?.highRisk)} high risk · ${formatCount(job.summary?.networksWritten)} networks`, href: `alerts.html?source=${encodeURIComponent(job.id)}`, jobId: job.id });
        if (job.status === 'failed') showNotice({ key: job.id, tone: 'warn', title: `${job.fileName} was not scanned`, detail: 'Open it to see what went wrong.', jobId: job.id });
        if (job.status === 'columns') showNotice({ key: `${job.id}-columns`, tone: 'ask', title: `Check the columns of ${job.fileName}`, detail: 'Acurion has read your file.',
          note: 'Nothing is scanned until you confirm.', jobId: job.id });
      }
      setUploads(jobs);
    });
    return () => { stopHost(); stopUploads(); window.clearTimeout(timer.current); window.clearTimeout(confirmTimer.current); };
  }, [showNotice]);

  const myUpload = uploads.find(job => job.mine && ACTIVE_UPLOAD.includes(job.status)) || (flow.step === 'sending' ? { id: '', fileName: flow.file?.name || 'Your file', status: 'uploading', mine: true } : undefined);
  const online = status?.connection === 'online';
  const floating = !!(notice && noticeHost?.isConnected && (noticeHost as HTMLDialogElement).open);
  const mode: Mode = uploadOpen ? 'upload' : notice && !open && !floating ? 'notice' : !online && !myUpload ? 'hidden' : open ? 'expanded' : 'compact';
  const dropHost = useCallback(() => setNoticeHost(null), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);

  // While the upload panel is open, the page behind it dims and the header sits above the page dock.
  useEffect(() => {
    if (mode !== 'upload') return;
    document.documentElement.dataset.islandFocus = 'true';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) setUploadOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { delete document.documentElement.dataset.islandFocus; document.removeEventListener('keydown', onKey); };
  }, [mode]);

  // Close on Escape or a press outside; never while a command is being sent.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);
  useEffect(() => { if (mode === 'hidden') setOpen(false); }, [mode]);

  // The capsule's size follows its content, measured after every change, so it can spring between shapes.
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element) return;
    // x keeps a wide panel inside the viewport when the capsule sits off-centre (phones, narrow windows).
    const update = () => {
      const w = element.offsetWidth, h = element.offsetHeight, anchor = root.current?.getBoundingClientRect();
      let x = 0;
      if (anchor) {
        const left = anchor.left + anchor.width / 2 - w / 2, edge = document.documentElement.clientWidth - 12;
        if (left < 12) x = 12 - left; else if (left + w > edge) x = edge - (left + w);
      }
      setSize({ w, h, x });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [mode]);

  const command = async (action: 'start' | 'stop') => {
    window.clearTimeout(confirmTimer.current);
    setBusy(true); setMessage({ text: '' });
    try {
      const answer = await sendDeskCommand(action);
      if (!answer.ok) setMessage({ text: answer.message });
      else if (action === 'start') {
        setMessage({ text: START_CONFIRMED, tone: 'ok' });
        confirmTimer.current = window.setTimeout(() => setMessage({ text: '' }), CONFIRM_MS);
      }
    }
    catch { setMessage({ text: 'The command could not be sent. Check your connection and try again.' }); }
    finally { setBusy(false); }
  };

  const noticeView = notice ? (() => {
    const inner = <><span className="island-notice-mark" aria-hidden="true" />
      <span className="island-notice-text"><strong>{notice.title}</strong>{notice.detail ? <small>{notice.detail}</small> : null}{notice.note ? <em>{notice.note}</em> : null}</span>
      {notice.href || notice.jobId ? <span className="island-notice-go">Open</span> : null}</>;
    return notice.href || notice.jobId
      ? <a className="island-notice" href={notice.href || '#'} data-tone={notice.tone} onClick={event => { setNotice(null); if (notice.jobId) { event.preventDefault(); openUpload(notice.jobId); } }}>{inner}</a>
      : <button type="button" className="island-notice" data-tone={notice.tone} aria-label={`${notice.title}. Dismiss`} onClick={() => setNotice(null)}>{inner}</button>;
  })() : null;
  const float = floating && noticeHost ? <FloatingNotice key={notice!.key} host={noticeHost} onGone={dropHost}>{noticeView}</FloatingNotice> : null;
  if (!status || mode === 'hidden') return <div className="host-island-anchor" data-empty="true" ref={root}>{float}</div>;
  const scrim = typeof document === 'undefined' ? null : createPortal(<AnimatePresence>{mode === 'upload' &&
    <motion.div key="scrim" className="island-scrim" aria-hidden="true" onClick={closeUpload} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.1 : 0.24 }} />}</AnimatePresence>, document.body);
  const k7 = status.k7;
  const controls = canControlDesk(role);
  const spring = reduced ? { duration: 0 } : mode === 'compact' ? { type: 'spring' as const, bounce: 0, duration: 0.42 } : mode === 'upload' ? { type: 'spring' as const, bounce: 0.14, duration: 0.55 } : { type: 'spring' as const, bounce: 0.2, duration: 0.5 };
  const fade = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, scale: 0.94, filter: 'blur(6px)' }, animate: { opacity: 1, scale: 1, filter: 'blur(0px)' }, exit: { opacity: 0, scale: 0.94, filter: 'blur(6px)' }, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const } };

  let content: ReactNode;
  if (mode === 'upload') {
    content = <UploadPanel host={status} onClose={closeUpload} readOnly={role === 'viewer' && status?.connection !== 'signed-out'} />;
  } else if (mode === 'notice' && notice) {
    content = noticeView;
  } else if (mode === 'expanded') {
    const recent = k7.recent.slice(0, 3);
    content = <div className="island-panel" id="host-island-panel" role="dialog" aria-label="Acurion K7 live detection">
      <div className="island-head">
        <div><span className="island-kicker">Live detection</span><strong>Acurion K7</strong></div>
        <span className="island-state" data-state={online ? k7.state : 'offline'}>{online ? STATE_LABEL[k7.state] : 'Offline'}</span>
      </div>
      <p className="island-desc">{describeK7(status)}</p>
      {online && k7.total > 0 && <div className="island-progress">
        <div className="island-track" role="progressbar" aria-valuemin={0} aria-valuemax={k7.total} aria-valuenow={k7.sent} aria-label="Payments checked"><i style={{ width: `${k7.progress * 100}%` }} /></div>
        <div className="island-progress-meta"><span>{formatCount(k7.sent)} of {formatCount(k7.total)} payments checked</span><span>{k7.speed ? `${Math.round(k7.speed)} per second` : percent(k7.progress)}</span></div>
      </div>}
      {online && <dl className="island-stats">
        <div><dt>Alerts</dt><dd data-tone={k7.alerts ? 'alert' : undefined}>{formatCount(k7.alerts)}</dd></div>
        <div><dt>Worth a look</dt><dd>{formatCount(k7.watch)}</dd></div>
        <div><dt>Payment time</dt><dd>{paymentClock(k7.paymentTime)}</dd></div>
      </dl>}
      {recent.length > 0 && <div className="island-alerts">{recent.map((alert: any) =>
        <a key={alert.alertId} href={`alerts.html?alert=${encodeURIComponent(alert.alertId)}`} className="island-alert">
          <span className="island-alert-text"><strong className="pii">{alert.accountId}</strong><small>{alert.reason || formatDateTime(alert.timestamp)}</small></span>
          <span className="island-alert-score">{formatRisk(alert.riskScore)}</span>
        </a>)}</div>}
      {myUpload && <a className="island-upload" href="transactions.html#uploads" data-ask={myUpload.status === 'columns' || undefined}
        onClick={event => { if (myUpload.status === 'columns') { event.preventDefault(); setOpen(false); openUpload(myUpload.id); } }}><UploadGlyph /><span><strong>{myUpload.fileName}</strong><small>{describeUpload(myUpload)}</small></span></a>}
      <div className="island-actions">
        {online && controls && (canPause(status)
          ? <button type="button" className="island-button" disabled={busy} onClick={() => command('stop')}>{busy ? 'Pausing…' : 'Pause'}</button>
          : <button type="button" className="island-button is-primary" disabled={busy || !canStart(status)} onClick={() => command('start')}>{busy ? 'Starting…' : 'Start'}</button>)}
        {online && !controls && <span className="island-note">A reviewer starts and pauses K7.</span>}
        <button type="button" className="island-button" onClick={() => { setOpen(false); openUpload(); }}><UploadGlyph />Upload dataset</button>
        <a className="island-link" href="index.html#live-detection">Details</a>
      </div>
      {message.text && <p className="island-message" role="status" data-tone={message.tone}>{message.text}</p>}
    </div>;
  } else {
    const uploadOnly = !online || (myUpload && k7.state !== 'running');
    const sending = flow.step === 'sending';
    content = <button type="button" className="island-compact" aria-expanded={uploadOnly ? undefined : open} aria-controls={uploadOnly ? undefined : 'host-island-panel'}
      onClick={() => uploadOnly ? openUpload(myUpload?.id || undefined) : setOpen(true)}
      aria-label={uploadOnly ? `Upload: ${myUpload?.fileName}, ${sending ? 'sending' : describeUpload(myUpload)}. Open` : `Acurion K7: ${STATE_LABEL[k7.state]}. Open live detection`}>
      {uploadOnly ? <><span className="island-glyph" data-ask={myUpload.status === 'columns' || undefined}>{sending ? <MiniRing share={sentShare(flow.progress)} /> : <UploadGlyph />}</span><span className="island-name">{sending ? `Sending ${Math.round(sentShare(flow.progress) * 100)}%` : UPLOAD_WORD[myUpload.status] || 'Scanning'}</span><span className="island-figure island-file">{myUpload.fileName}</span></>
        : <>
          <span className="island-dot" data-state={k7.state} aria-hidden="true" />
          <span className="island-name">K7</span>
          {k7.state === 'running' ? <><span className="island-meter" aria-hidden="true"><i style={{ width: `${Math.max(2, k7.progress * 100)}%` }} /></span><span className="island-figure">{formatCount(k7.sent)} / {formatCount(k7.total)}</span></>
            : <span className="island-figure">{k7.state === 'paused' ? `Paused · ${percent(k7.progress)}` : k7.state === 'finished' ? `Finished · ${formatCount(k7.alerts)} alerts` : STATE_LABEL[k7.state]}</span>}
          {k7.alerts > 0 && <span className="island-count" aria-label={`${k7.alerts} alerts`}>{formatCount(k7.alerts)}</span>}
        </>}
    </button>;
  }

  return <div className="host-island-anchor" ref={root} data-mode={mode} onPointerEnter={() => { hovering.current = true; }} onPointerLeave={() => { hovering.current = false; }}>
    {scrim}{float}
    <motion.div className="host-island" data-mode={mode} initial={false}
      animate={size ? { width: size.w, height: size.h, x: size.x, borderRadius: mode === 'compact' ? 19 : 26 } : undefined} transition={spring}>
      <div className="host-island-measure" ref={measure} data-mode={mode}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={mode === 'notice' ? `notice-${notice?.key}` : mode} className="host-island-content" {...fade}>{content}</motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
    <span className="sr-only" aria-live="polite">{notice ? `${notice.title}. ${notice.detail || ''}` : ''}</span>
  </div>;
}

export function mountHostIsland(element: HTMLElement) { const root = createRoot(element); root.render(<HostIsland />); return () => root.unmount(); }
