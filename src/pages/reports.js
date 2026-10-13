import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { renderLayout } from '../components/layout.js';
import { mountDraftTray } from '../islands/draft-tray.tsx';
import { getAuditLogs, getOverviewStats } from '../lib/dataService.js';
import { formatDateTime, decisionBadgeClass } from '../lib/utils.js';

const main = renderLayout({
  active: 'reports.html',
  pageTitle: 'Reports',
  pageSubtitle: 'Compliance audit trail & exportable summaries',
});

main.innerHTML = `
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" id="summary-cards"></div>

  <div class="card !p-0 overflow-hidden mb-6">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div>
        <h3 class="font-semibold">Audit Log</h3>
        <p class="text-xs text-text-faint mt-0.5">Recorded decisions from the configured data source</p>
      </div>
      <button id="export-btn" class="btn-ghost text-xs">Export CSV</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-text-faint text-xs uppercase tracking-wide bg-surface-2">
            <th class="px-5 py-3 font-medium">Log ID</th>
            <th class="px-5 py-3 font-medium">Alert</th>
            <th class="px-5 py-3 font-medium">Transaction</th>
            <th class="px-5 py-3 font-medium">Action</th>
            <th class="px-5 py-3 font-medium">Decision</th>
            <th class="px-5 py-3 font-medium">Actor</th>
            <th class="px-5 py-3 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody id="log-rows"></tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h3 class="font-semibold mb-2">Report Generation</h3>
    <p class="text-sm text-text-faint mb-4">Generate a compliance summary for regulatory reporting (summary export).</p>
    <div class="flex flex-wrap gap-3">
      <button class="btn-primary text-sm" id="gen-report">Generate Summary Report</button>
      <button class="btn-ghost text-sm" id="gen-sar">Open STR / SAR workspace</button>
    </div>
    <div id="report-output" class="mt-4 hidden"></div>
  </div>
  <div id="draft-tray" class="mt-6"></div>
`;

mountDraftTray(document.getElementById('draft-tray'));

async function renderSummary() {
  const [stats, logs] = await Promise.all([getOverviewStats(), getAuditLogs()]);
  const blocked = logs.filter((l) => l.decision === 'block').length;
  const flagged = logs.filter((l) => l.decision === 'flag').length;

  const el = document.getElementById('summary-cards');
  el.innerHTML = `
    <div class="stat-card">
      <div class="text-2xl font-semibold font-mono">${logs.length}</div>
      <div class="text-sm text-text-faint mt-1">Total audit entries</div>
    </div>
    <div class="stat-card">
      <div class="text-2xl font-semibold font-mono">${blocked}</div>
      <div class="text-sm text-text-faint mt-1">Transactions blocked</div>
    </div>
    <div class="stat-card">
      <div class="text-2xl font-semibold font-mono">${flagged}</div>
      <div class="text-sm text-text-faint mt-1">Transactions flagged</div>
    </div>
  `;

}

let allLogs = [];

async function renderLogs() {
  allLogs = (await getAuditLogs()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const tbody = document.getElementById('log-rows');
  tbody.innerHTML = allLogs.map((l) => `
    <tr class="table-row">
      <td class="px-5 py-3 font-mono text-text-dim">${l.id}</td>
      <td class="px-5 py-3 font-mono">${l.alertId}</td>
      <td class="px-5 py-3 font-mono">${l.transactionId}</td>
      <td class="px-5 py-3 text-text-dim">${l.action}</td>
      <td class="px-5 py-3"><span class="${decisionBadgeClass(l.decision)}">${l.decision}</span></td>
      <td class="px-5 py-3 font-mono text-text-faint">${l.actor}</td>
      <td class="px-5 py-3 text-right text-text-faint">${formatDateTime(l.timestamp)}</td>
    </tr>
  `).join('');
  if(location.hash === '#draft-tray') document.getElementById('draft-tray').scrollIntoView({block:'start'});

}

function exportCSV() {
  const headers = ['Log ID', 'Alert', 'Transaction', 'Action', 'Decision', 'Actor', 'Time'];
  const rows = allLogs.map((l) => [l.id, l.alertId, l.transactionId, l.action, l.decision, l.actor, l.timestamp]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&")}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'acurion_audit_log.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function generateReport() {
  const output = document.getElementById('report-output');
  const now = new Date().toLocaleString('en-GB');
  const blocked = allLogs.filter((l) => l.decision === 'block').length;
  const flagged = allLogs.filter((l) => l.decision === 'flag').length;

  const content = `
      <div class="bg-surface-2 rounded-lg p-4 font-mono text-xs leading-relaxed text-text-dim">
        <div class="text-text font-semibold mb-2">ACURION - LOADED AUDIT SUMMARY</div>
        <div>Generated: ${now}</div>
        <div class="mt-2">Loaded audit entries: ${allLogs.length}</div>
        <div>Recorded block decisions: ${blocked}</div>
        <div>Recorded flag decisions: ${flagged}</div>
        <div class="mt-2 text-text-faint">Summary of the configured data source. Prepare an investigation-specific STR/SAR draft in the Compliance workspace.</div>
      </div>
    `;
  output.innerHTML = content;
  output.classList.remove('hidden');
  animate(output, { opacity: [0, 1], translateY: [8, 0], duration: 350, ease: 'outQuad' });
}

renderSummary();
renderLogs();
document.getElementById('export-btn').addEventListener('click', exportCSV);
document.getElementById('gen-report').addEventListener('click', () => generateReport());
document.getElementById('gen-sar').addEventListener('click', () => { window.location.href = 'compliance.html'; });
