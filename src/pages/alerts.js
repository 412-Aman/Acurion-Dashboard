import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { renderLayout } from '../components/layout.js';
import { getAlerts } from '../lib/dataService.js';
import { formatDateTime, severityBadgeClass, decisionBadgeClass } from '../lib/utils.js';

const main = renderLayout({
  active: 'alerts.html',
  pageTitle: 'Alerts',
  pageSubtitle: 'AI-detected suspicious activity requiring review',
});

main.innerHTML = `
  <div class="flex flex-wrap items-center gap-3 mb-5">
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

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div class="lg:col-span-2 card !p-0 overflow-hidden">
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

    <div class="card" id="detail-panel">
      <div class="text-center py-16 text-text-faint text-sm">
        Select an alert to view AI explanation details.
      </div>
    </div>
  </div>
`;

let allAlerts = [];

function renderRows(list) {
  const tbody = document.getElementById('alert-rows');
  const empty = document.getElementById('empty-state');
  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = list.map((a) => `
    <tr class="table-row cursor-pointer opacity-0" data-id="${a.id}">
      <td class="px-5 py-3 font-mono text-text-dim">${a.id}</td>
      <td class="px-5 py-3 font-mono">${a.suspiciousAccount}</td>
      <td class="px-5 py-3 font-mono">${a.riskScore.toFixed(2)}</td>
      <td class="px-5 py-3"><span class="badge ${severityBadgeClass(a.severity)}">${a.severity}</span></td>
      <td class="px-5 py-3"><span class="${decisionBadgeClass(a.decision)}">${a.decision}</span></td>
      <td class="px-5 py-3 capitalize text-text-dim">${a.status}</td>
      <td class="px-5 py-3 text-text-faint">${formatDateTime(a.timestamp)}</td>
    </tr>
  `).join('');

  animate('#alert-rows .table-row', {
    opacity: [0, 1],
    duration: 300,
    delay: stagger(30),
    ease: 'outQuad',
  });

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
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold font-mono">${alert.id}</h3>
        <p class="text-xs text-text-faint mt-0.5">Transaction ${alert.transactionId}</p>
      </div>
      <span class="badge ${severityBadgeClass(alert.severity)}">${alert.severity}</span>
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
      <div class="bg-surface-2 rounded-lg p-3 text-xs text-text-dim leading-relaxed">${alert.reason}</div>
      ${alert.sourceDataset ? `
      <div class="mt-2 flex items-center gap-2 text-xs text-text-faint">
        <span>Source dataset:</span>
        <span class="font-mono text-text-dim">${alert.sourceDataset}</span>
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
              <span class="text-text-dim font-mono">${f.feature}</span>
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
      <p class="text-xs text-text-dim leading-relaxed mb-3">${alert.gnnExplanation.summary}</p>
      <div class="flex items-center justify-between text-xs">
        <span class="text-text-faint">Dataset: <span class="font-mono text-text-dim">${alert.gnnExplanation.clusterId}</span></span>
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
    return matchesSearch && matchesSeverity && matchesDecision;
  });
  renderRows(filtered);
}

async function init() {
  allAlerts = (await getAlerts()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  renderRows(allAlerts);

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('severity-filter').addEventListener('change', applyFilters);
  document.getElementById('decision-filter').addEventListener('change', applyFilters);
}

init();
