// Overview card: Acurion K7 live detection. Start / Pause (reviewers and admins), progress, counts and
// K7's newest alerts, refreshed about once a second from the host's status in Firebase.
import { escapeHTML as esc, icon } from './icons.js';
import { watchHost, sendDeskCommand } from '../lib/hostDesk.js';
import { canControlDesk, canStart, canPause, describeK7, formatCount } from '../lib/hostStatus.js';
import { getMyRole } from '../lib/dataService.js';
import { exitDemo, DEMO_MODE, HOST_PREVIEW } from '../lib/config.js';
import { formatRisk, formatDateTime, severityBadgeClass } from '../lib/utils.js';

const LABEL = { 'getting ready': 'Loading history', ready: 'Ready', running: 'Running', paused: 'Paused', finished: 'Finished', failed: 'Needs attention', offline: 'Offline' };
const clock = iso => iso && Number.isFinite(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '–';

export function mountLiveDetection(element) {
  let role = DEMO_MODE && !HOST_PREVIEW ? 'viewer' : 'analyst', status = null, shape = '', busy = false, message = '';
  getMyRole().then(value => { role = value; shape = ''; render(); });

  function render() {
    if (!status) return;
    const online = status.connection === 'online', k7 = status.k7, controls = canControlDesk(role);
    const state = online ? k7.state : status.connection === 'signed-out' ? 'signed-out' : 'offline';
    const next = [state, controls, busy, message, k7.recent.map(a => a.alertId).join(','), online && k7.total > 0].join('|');
    if (next !== shape) {
      shape = next;
      const action = status.connection === 'signed-out'
        ? `<a class="btn-primary" href="login.html?next=index.html" data-sign-in>${icon('arrow', 16)}Sign in to run K7</a>`
        : online && controls ? (canPause(status)
          ? `<button class="btn-ghost" data-desk="stop" ${busy ? 'disabled' : ''}>${busy ? 'Pausing…' : 'Pause K7'}</button>`
          : `<button class="btn-primary" data-desk="start" ${busy || !canStart(status) ? 'disabled' : ''}>${busy ? 'Starting…' : 'Start K7'}</button>`) : '';
      element.innerHTML = `<div class="live-head"><div><span class="section-kicker">Live detection</span><div class="live-title-row"><h2 id="live-title">Acurion K7</h2><span class="live-state" data-state="${esc(state)}">${esc(state === 'signed-out' ? 'Sign in' : LABEL[state] || 'Offline')}</span></div><p class="live-desc" data-field="desc"></p></div><div class="live-actions">${action}<button class="btn-ghost" data-open-upload>${icon('upload', 16)}Upload dataset</button></div></div>
        ${online && k7.total > 0 ? `<div class="live-progress"><div class="live-track" role="progressbar" aria-label="Payments checked" aria-valuemin="0" aria-valuemax="${k7.total}" data-field="aria"><i data-field="bar"></i></div><div class="live-progress-meta"><span data-field="checked"></span><span data-field="speed"></span></div></div>
        <dl class="live-stats"><div><dt>Alerts raised</dt><dd data-field="alerts"></dd></div><div><dt>Worth a look</dt><dd data-field="watch"></dd></div><div><dt>Payment time</dt><dd data-field="clock"></dd></div><div><dt>Data</dt><dd data-field="dataset"></dd></div></dl>` : ''}
        ${online && k7.recent.length ? `<div class="live-alerts"><h3>Newest K7 alerts</h3><div class="priority-list">${k7.recent.slice(0, 5).map(a => `<a class="priority-row" data-severity="${esc(a.severity)}" href="alerts.html?alert=${encodeURIComponent(a.alertId)}"><div><strong class="font-mono">${esc(a.alertId)}</strong><small><span class="pii">${esc(a.accountId)}</span> · ${formatDateTime(a.timestamp)}</small><small class="live-reason">${esc(a.reason)}</small></div><span class="priority-score">${formatRisk(a.riskScore)}</span><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></a>`).join('')}</div></div>` : ''}
        ${online && !controls ? '<p class="helper">A reviewer or admin starts and pauses K7. You see its alerts here and in the queue as they arrive.</p>' : ''}
        ${message ? `<p class="live-message" role="status">${esc(message)}</p>` : ''}
        ${state === 'offline' && status.connection !== 'signed-out' ? '<p class="helper">K7 runs on the team’s host computer with two weeks of payment history. The host team starts it with docs/HOST_SETUP.md; this card updates on its own when it connects.</p>' : ''}
        ${status.connection === 'signed-out' ? '<p class="helper">K7 checks a recorded stream of IBM’s simulated bank payments (HI-Large) one batch at a time and raises an alert when a payment looks like laundering. Its alerts carry the reasons behind each score.</p>' : ''}`;
      element.querySelector('[data-desk]')?.addEventListener('click', async event => {
        busy = true; message = ''; render();
        try { const answer = await sendDeskCommand(event.currentTarget.dataset.desk); if (!answer.ok) message = answer.message; }
        catch { message = 'The command could not be sent. Check your connection and try again.'; }
        finally { busy = false; render(); }
      });
      element.querySelector('[data-sign-in]')?.addEventListener('click', () => exitDemo());
    }
    // Numbers change every second; they are updated in place so focus and hover are never lost.
    const set = (field, value) => { const node = element.querySelector(`[data-field="${field}"]`); if (node && node.textContent !== value) node.textContent = value; };
    set('desc', describeK7(status));
    if (online && k7.total > 0) {
      element.querySelector('[data-field="bar"]').style.width = `${k7.progress * 100}%`;
      element.querySelector('[data-field="aria"]').setAttribute('aria-valuenow', String(k7.sent));
      set('checked', `${formatCount(k7.sent)} of ${formatCount(k7.total)} payments checked`);
      set('speed', k7.speed ? `${Math.round(k7.speed)} payments per second` : `${(Math.floor(k7.progress * 1000) / 10).toFixed(1)}% done`);
      set('alerts', formatCount(k7.alerts)); set('watch', formatCount(k7.watch)); set('clock', clock(k7.paymentTime)); set('dataset', k7.dataset ? `IBM ${k7.dataset}` : '–');
    }
  }
  return watchHost(value => { status = value; render(); });
}
