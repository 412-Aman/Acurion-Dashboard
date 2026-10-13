import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { renderLayout } from '../components/layout.js';
import { icon, escapeHTML as esc } from '../components/icons.js';
import { getAlerts } from '../lib/dataService.js';
import { formatDateTime, severityBadgeClass, decisionBadgeClass } from '../lib/utils.js';

const main = renderLayout({
  active: 'alerts.html',
  pageTitle: 'Alerts',
  pageSubtitle: 'AI-detected suspicious activity requiring review',
});

main.innerHTML = `
  <nav class="workspace-tabs" aria-label="Alert views"><button class="selected" data-status="">${icon('alerts',14)}All alerts</button><button data-status="open">Open</button><button data-status="investigating">Investigating</button><button data-status="resolved">Resolved</button></nav>
  <div class="flex flex-wrap items-center gap-3 mb-5">
    <div class="view-switch" aria-label="Alert view mode"><button data-alert-view="list" class="selected" aria-pressed="true">${icon('list',14)}List</button><button data-alert-view="board" aria-pressed="false">${icon('board',14)}Board</button></div>
    <input id="search" type="text" placeholder="Search alert ID or account..." class="input flex-1 min-w-[220px]" />
    <select id="severity-filter" class="input">
      <option value="">All severities</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    <select id="decision-filter" class="input">
      <option value="">All decisions</option>
      <option value="block">Block</option>
      <option value="flag">Flag</option>
    </select>
  </div>

  <div id="alert-board" class="board" hidden></div><div id="alert-list-layout">
    <div class="card !p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-text-faint text-xs uppercase tracking-wide bg-surface-2">
              <th class="px-5 py-3 font-medium">Alert ID</th>
              <th class="px-5 py-3 font-medium">Account</th>
              <th class="px-5 py-3 font-medium">Risk</th>
              <th class="px-5 py-3 font-medium">Severity</th>
              <th class="px-5 py-3 font-medium">Decision</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody id="alert-rows"></tbody>
        </table>
      </div>
      <div id="empty-state" class="hidden text-center py-12 text-text-faint text-sm">No alerts match your filters.</div>
    </div>

  </div><p class="helper mt-3" id="alert-count"></p>
  <dialog id="alert-dialog" class="detail-dialog" aria-label="Alert details"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close alert details">${icon('close')}</button></form><div id="detail-panel"></div></dialog>
`;

let allAlerts = [];
let alertView = 'list', statusFilter = '';
const alertDialog = document.getElementById('alert-dialog');

function renderRows(list) {
  document.getElementById('alert-count').textContent = `${list.length} of ${allAlerts.length} alerts`;
  document.getElementById('alert-list-layout').hidden = alertView === 'board';
  document.getElementById('alert-board').hidden = alertView !== 'board';
  document.getElementById('alert-board').innerHTML = ['open','investigating','resolved'].map(status => { const items = list.filter(a => a.status === status); return `<section class="board-column"><div class="board-header">${status.charAt(0).toUpperCase()+status.slice(1)}<small>${items.length}</small></div>${items.map(a => `<button class="board-card" data-alert-id="${esc(a.id)}"><p>${esc(a.id)}</p><small>${esc(a.suspiciousAccount)}</small><div class="card-meta"><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span><small>Risk ${a.riskScore.toFixed(2)}</small></div></button>`).join('') || '<div class="board-empty">No alerts in this stage</div>'}</section>`; }).join('');
  document.querySelectorAll('[data-alert-id]').forEach(b => b.onclick = () => renderDetail(allAlerts.find(a => a.id === b.dataset.alertId)));
  const tbody = document.getElementById('alert-rows');
  const empty = document.getElementById('empty-state');
  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = list.map((a) => `
    <tr class="table-row cursor-pointer" data-id="${esc(a.id)}">
      <td class="px-5 py-3 font-mono text-text-dim">${esc(a.id)}</td>
      <td class="px-5 py-3 font-mono">${esc(a.suspiciousAccount)}</td>
      <td class="px-5 py-3 font-mono">${a.riskScore.toFixed(2)}</td>
      <td class="px-5 py-3"><span class="badge ${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></td>
      <td class="px-5 py-3"><span class="${decisionBadgeClass(a.decision)}">${esc(a.decision)}</span></td>
      <td class="px-5 py-3 capitalize text-text-dim">${esc(a.status)}</td>
      <td class="px-5 py-3 text-text-faint">${formatDateTime(a.timestamp)}</td>
    </tr>
  `).join('');



  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('bg-surface-2'));
      row.classList.add('bg-surface-2');
      const alert = allAlerts.find((a) => a.id === row.dataset.id);
      renderDetail(alert);
    });
  });
}

function renderDetail(alert) {
  if (!alert) return;
  const panel = document.getElementById('detail-panel');
  if (!alertDialog.open) alertDialog.showModal();
  panel.innerHTML = `
    <div class="flex items-center justify-between mb-4 pr-8">
      <div>
        <h3 class="font-semibold font-mono">${esc(alert.id)}</h3>
        <p class="text-xs text-text-faint mt-0.5">Transaction ${esc(alert.transactionId)}</p>
      </div>
      <span class="badge ${severityBadgeClass(alert.severity)}">${esc(alert.severity)}</span>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-5">
      <div class="bg-surface-2 rounded-lg p-3">
        <div class="text-xs text-text-faint mb-1">Risk Score</div>
        <div class="text-xl font-mono font-semibold">${alert.riskScore.toFixed(2)}</div>
      </div>
      <div class="bg-surface-2 rounded-lg p-3">
        <div class="text-xs text-text-faint mb-1">Decision</div>
        <div class="text-xl"><span class="${decisionBadgeClass(alert.decision)}">${alert.decision}</span></div>
      </div>
    </div>

    ${alert.reason ? `
    <div class="mb-5">
      <h4 class="text-sm font-medium mb-2">AI Detection Reason</h4>
      <div class="bg-surface-2 rounded-lg p-3 text-xs text-text-dim leading-relaxed">${esc(alert.reason)}</div>
      ${alert.sourceDataset ? `
      <div class="mt-2 flex items-center gap-2 text-xs text-text-faint">
        <span>Source dataset:</span>
        <span class="font-mono text-text-dim">${esc(alert.sourceDataset)}</span>
      </div>` : ''}
    </div>` : ''}

    ${alert.shapExplanation.topFeatures.length > 0 ? `
    <div class="mb-5">
      <h4 class="text-sm font-medium mb-2">SHAP Explanation</h4>
      <p class="text-xs text-text-faint mb-3">Feature contributions to the risk score</p>
      <div class="space-y-2">
        ${alert.shapExplanation.topFeatures.map((f) => `
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-text-dim font-mono">${esc(f.feature)}</span>
              <span class="font-mono ${f.impact >= 0 ? 'text-text' : 'text-text-faint'}">${f.impact >= 0 ? '+' : ''}${f.impact.toFixed(2)}</span>
            </div>
            <div class="h-1.5 rounded-full bg-surface-3 overflow-hidden relative">
              <div class="h-full ${f.impact >= 0 ? 'bg-text' : 'bg-text-faint'} rounded-full" style="width:${Math.min(Math.abs(f.impact) * 200, 100)}%; margin-left:${f.impact < 0 ? 'auto' : '0'}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div>
      <h4 class="text-sm font-medium mb-2">GNN Analysis</h4>
      <p class="text-xs text-text-dim leading-relaxed mb-3">${esc(alert.gnnExplanation.summary)}</p>
      <div class="flex items-center justify-between text-xs">
        <span class="text-text-faint">Dataset: <span class="font-mono text-text-dim">${esc(alert.gnnExplanation.clusterId)}</span></span>
        <span class="text-text-faint">Confidence: <span class="font-mono text-text-dim">${Math.round(alert.gnnExplanation.confidence * 100)}%</span></span>
      </div>
      <a href="graph.html" class="btn-primary w-full mt-4 text-xs">Investigate in Graph</a>
    </div>
  `;
  animate(panel, { opacity: [0, 1], translateY: [8, 0], duration: 350, ease: 'outQuad' });
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const severity = document.getElementById('severity-filter').value;
  const decision = document.getElementById('decision-filter').value;

  const filtered = allAlerts.filter((a) => {
    const matchesSearch = !search || a.id.toLowerCase().includes(search) || a.suspiciousAccount.toLowerCase().includes(search);
    const matchesSeverity = !severity || a.severity === severity;
    const matchesDecision = !decision || a.decision === decision;
    return matchesSearch && matchesSeverity && matchesDecision && (!statusFilter || a.status === statusFilter);
  });
  renderRows(filtered);
}

async function init() {
  allAlerts = (await getAlerts()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  renderRows(allAlerts);
  const focusId = new URLSearchParams(location.search).get('alert');
  if (focusId) renderDetail(allAlerts.find(a => a.id === focusId));

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('severity-filter').addEventListener('change', applyFilters);
  document.getElementById('decision-filter').addEventListener('change', applyFilters);
}

document.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { statusFilter = b.dataset.status; document.querySelectorAll('[data-status]').forEach(t => t.classList.toggle('selected',t === b)); applyFilters(); });
document.querySelectorAll('[data-alert-view]').forEach(b => b.onclick = () => { alertView = b.dataset.alertView; document.querySelectorAll('[data-alert-view]').forEach(t => { t.classList.toggle('selected',t === b); t.setAttribute('aria-pressed', String(t === b)); }); applyFilters(); });

init();
