// One place for confirmations and warnings: the header pill (src/islands/host-island.tsx) pops them open.
// Pages call notify(); the pill registers with onNotify(). Notices sent before the pill has loaded wait in a
// queue, and `{ next: true }` carries a notice over to the next page (for actions that navigate away).
//
// notice: { tone: 'ok' | 'warn' | 'alert' | 'ask' | 'info' | 'tip' | 'busy', title, detail?, note?, href?, key?,
//           sticky? (stays until another notice replaces it) }
const NEXT_KEY = 'acurion:next-notice';
let handler = null;
const queue = [];

export function notify(notice, { next = false } = {}) {
  const item = { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tone: 'info', ...notice };
  if (next) { try { sessionStorage.setItem(NEXT_KEY, JSON.stringify(item)); return; } catch { /* fall through and show it now */ } }
  if (handler) handler(item); else queue.push(item);
}

export function onNotify(next) {
  handler = next;
  try {
    const carried = sessionStorage.getItem(NEXT_KEY);
    if (carried) { sessionStorage.removeItem(NEXT_KEY); queue.unshift(JSON.parse(carried)); }
  } catch { /* storage unavailable */ }
  while (queue.length) handler(queue.shift());
  return () => { if (handler === next) handler = null; };
}

// A pill that says what is happening, then turns into the result in place. It appears only when the work takes
// longer than `after` ms, so a quick action goes straight to its result instead of flickering.
//   const work = notifyBusy('Checking the signature…'); … work.done({ title: 'Signature valid' }) / work.fail({ … })
export function notifyBusy(title, { detail = '', after = 250 } = {}) {
  const key = `busy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let finished = false;
  const timer = setTimeout(() => { if (!finished) notify({ key, tone: 'busy', title, detail, sticky: true }); }, after);
  const finish = notice => { if (finished) return; finished = true; clearTimeout(timer); notify({ ...notice, key }); };
  return { done: notice => finish({ tone: 'ok', ...notice }), fail: notice => finish({ tone: 'warn', ...notice }) };
}

// Once per browser, per page: a short tip in the pill the first time someone opens that page.
const TIPS_KEY = 'acurion:tips-seen';
export function tipOnce(page, title, { delay = 1400 } = {}) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(TIPS_KEY) || '[]'); } catch { return; }
  if (!Array.isArray(seen) || seen.includes(page) || seen.includes('*')) return;
  try { localStorage.setItem(TIPS_KEY, JSON.stringify([...seen, page])); } catch { return; }
  setTimeout(() => notify({ tone: 'tip', title, note: 'Tip, shown once' }), delay);
}
