import { escapeHTML as esc } from './icons.js';
import { describeDataError } from '../lib/dataStatus.js';
export function renderLoadError(element,error,retry) {
  element.innerHTML=`<div class="data-empty" role="alert"><strong>Records could not be loaded</strong><p>${esc(describeDataError(error))}</p><div class="action-row"><button class="btn-ghost" data-retry>Retry</button><a class="text-button" href="system.html">Check System status →</a></div></div>`;
  element.querySelector('[data-retry]').onclick=retry;
}
export function renderLoading(element,label='records') { element.innerHTML=`<div class="data-empty" role="status">Loading ${esc(label)}…</div>`; }
