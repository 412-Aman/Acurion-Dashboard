// Numbers that count up to their value when they first appear, and from the old value when it changes, so a
// change is noticed. Instant with reduced motion. The element keeps the final, formatted value as its text.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function countUp(element, to, { duration = 800, format = n => n.toLocaleString('en-GB') } = {}) {
  if (!element || !Number.isFinite(to)) return;
  const from = Number(element.dataset.count ?? 0);
  element.dataset.count = String(to);
  if (reduced() || from === to) { element.textContent = format(to); return; }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
    element.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1 && element.dataset.count === String(to)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// A short spring on an element whose number just changed (stage tabs, counters).
export function bump(element) {
  if (!element || reduced()) return;
  element.classList.remove('is-bumped'); void element.offsetWidth; element.classList.add('is-bumped');
}
