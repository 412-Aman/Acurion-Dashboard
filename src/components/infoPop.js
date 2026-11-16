// "More info" pop-overs: screens keep one plain sentence, and the detail springs open from a small button.
// Works for static markup and React islands alike: any [data-info] button opens the <template> that follows it
// (or its data-info-text). The pop-over sits in the top layer, so dialogs and the header pill never cover it.
import { escapeHTML as esc } from './icons.js';

const INFO_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/></svg>';
const CLOSE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

// Markup for a trigger and its content. `html` is trusted markup built by the page (escape any data in it).
export function infoButton(html, { label = 'More info', title = '', compact = false } = {}) {
  return `<button type="button" class="info-trigger${compact ? ' is-compact' : ''}" data-info${title ? ` data-info-title="${esc(title)}"` : ''} aria-haspopup="dialog" aria-expanded="false"${compact ? ` aria-label="${esc(title || label)}"` : ''}>${INFO_ICON}${compact ? '' : `<span>${esc(label)}</span>`}</button><template class="info-template">${html}</template>`;
}
export const infoIcon = INFO_ICON;

let installed = false;
export function installInfoPops() {
  if (installed) return; installed = true;
  const pop = document.createElement('div');
  pop.className = 'info-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false'); pop.tabIndex = -1;
  pop.setAttribute('popover', 'manual'); pop.hidden = true;
  document.body.append(pop);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let trigger = null, closing = null;

  function content(node) {
    if (node.dataset.infoText) return `<p>${esc(node.dataset.infoText)}</p>`;
    const template = node.nextElementSibling?.matches('template.info-template') ? node.nextElementSibling : null;
    return template ? template.innerHTML : '';
  }
  function place() {
    if (!trigger?.isConnected) { close(false); return; }
    const r = trigger.getBoundingClientRect(), box = pop.getBoundingClientRect(), gap = 10;
    const below = r.bottom + gap + box.height <= innerHeight - 12 || r.top - gap - box.height < 12;
    const left = Math.max(12, Math.min(innerWidth - box.width - 12, r.left + r.width / 2 - box.width / 2));
    const top = below ? Math.min(innerHeight - box.height - 12, r.bottom + gap) : r.top - gap - box.height;
    pop.style.left = `${left}px`; pop.style.top = `${Math.max(12, top)}px`;
    // Grow out of the button that opened it.
    pop.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${below ? 0 : box.height}px`;
  }
  function open(node) {
    if (trigger === node) { close(); return; }
    close(false);
    const title = node.dataset.infoTitle || '';
    pop.innerHTML = `<div class="info-pop-head">${title ? `<strong>${esc(title)}</strong>` : '<span></span>'}<button type="button" class="info-pop-close" aria-label="Close">${CLOSE_ICON}</button></div><div class="info-pop-body">${content(node)}</div>`;
    pop.setAttribute('aria-label', title || 'More information');
    // Inside an open modal the pop-over must live in that dialog, or the modal makes it unclickable.
    const host = node.closest('dialog[open]') || document.body;
    if (pop.parentElement !== host) host.append(pop);
    trigger = node; node.setAttribute('aria-expanded', 'true');
    clearTimeout(closing); pop.hidden = false;
    if (typeof pop.showPopover === 'function' && !pop.matches(':popover-open')) pop.showPopover();
    place();
    pop.animate(reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(.9)', filter: 'blur(4px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }],
      { duration: reduced() ? 120 : 260, easing: 'cubic-bezier(.23,1,.32,1)' });
    pop.focus({ preventScroll: true });
  }
  function close(returnFocus = true) {
    if (!trigger) return;
    const was = trigger; trigger = null; was.setAttribute('aria-expanded', 'false');
    const finish = () => { if (trigger) return; if (pop.matches?.(':popover-open')) pop.hidePopover(); pop.hidden = true; pop.innerHTML = ''; };
    const out = pop.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 140, easing: 'ease-in' });
    out.onfinish = finish; closing = setTimeout(finish, 200);
    if (returnFocus && was.isConnected) was.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const node = event.target instanceof Element ? event.target.closest('[data-info]') : null;
    if (node) { event.preventDefault(); event.stopPropagation(); open(node); return; }
    if (event.target instanceof Element && event.target.closest('.info-pop-close')) { close(); return; }
    if (trigger && !pop.contains(event.target)) close(false);
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && trigger) { event.preventDefault(); event.stopPropagation(); close(); } }, true);
  addEventListener('resize', () => trigger && place());
  addEventListener('scroll', () => trigger && place(), true);
}
