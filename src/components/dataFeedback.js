import { escapeHTML as esc } from './icons.js';
import { dataErrorDetails } from '../lib/dataStatus.js';
import { auth } from '../lib/firebase.js';
export function renderLoadError(element,error,retry,context={}) {
  const detail=dataErrorDetails(error,{user:auth.currentUser,...context});
  element.innerHTML=`<div class="data-empty actionable-error" role="alert"><span class="error-kicker">ACTION NEEDED</span><strong>${esc(detail.title)}</strong><p>${esc(detail.message)}</p><div class="action-row"><a class="btn-primary" href="${esc(detail.href)}">${esc(detail.label)} →</a>${detail.retry&&retry?'<button class="btn-ghost" data-retry>Retry loading</button>':''}</div><details class="error-diagnostics"><summary>Technical details</summary><p>Code: <code>${esc(detail.code)}</code>${context.path?` · Path: /${esc(context.path)}`:''}</p></details></div>`;
  const button=element.querySelector('[data-retry]');if(button)button.onclick=retry;
}
export function renderLoading(element,label='records') { element.innerHTML=`<div class="data-empty" role="status">Loading ${esc(label)}…</div>`; }
