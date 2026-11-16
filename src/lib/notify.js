// One place for confirmations and warnings: the header pill (src/islands/host-island.tsx) pops them open.
// Pages call notify(); the pill registers with onNotify(). Notices sent before the pill has loaded wait in a
// queue, and `{ next: true }` carries a notice over to the next page (for actions that navigate away).
//
// notice: { tone: 'ok' | 'warn' | 'alert' | 'ask' | 'info', title, detail?, note?, href?, action?, key? }
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
