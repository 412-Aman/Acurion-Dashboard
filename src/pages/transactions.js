import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { renderLayout } from '../components/layout.js';
import { getTransactions } from '../lib/dataService.js';
import { formatDateTime, formatCurrency, decisionBadgeClass } from '../lib/utils.js';

const main = renderLayout({
  active: 'transactions.html',
  pageTitle: 'Transactions',
  pageSubtitle: 'Transaction records from the configured data source',
});

main.innerHTML = `
  <div class="flex flex-wrap items-center gap-3 mb-5">
    <input id="search" type="text" placeholder="Search transaction or account..." class="input flex-1 min-w-[220px]" />
    <select id="decision-filter" class="input">
      <option value="">All decisions</option>
      <option value="pass">Pass</option>
      <option value="flag">Flag</option>
      <option value="block">Block</option>
    </select>
    <select id="sort" class="input">
      <option value="time-desc">Newest first</option>
      <option value="time-asc">Oldest first</option>
      <option value="risk-desc">Highest risk</option>
      <option value="amount-desc">Highest amount</option>
    </select>
  </div>

  <div class="card !p-0 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-text-faint text-xs uppercase tracking-wide bg-surface-2">
            <th class="px-5 py-3 font-medium">Transaction ID</th>
            <th class="px-5 py-3 font-medium">From</th>
            <th class="px-5 py-3 font-medium">To</th>
            <th class="px-5 py-3 font-medium">Amount</th>
            <th class="px-5 py-3 font-medium">Channel</th>
            <th class="px-5 py-3 font-medium">Risk</th>
            <th class="px-5 py-3 font-medium">Decision</th>
            <th class="px-5 py-3 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody id="tx-rows"></tbody>
      </table>
    </div>
    <div id="empty-state" class="hidden text-center py-12 text-text-faint text-sm">No transactions match your filters.</div>
  </div>
  <div class="text-xs text-text-faint mt-3" id="count-label"></div>
`;

let allTx = [];

function renderRows(list) {
  const tbody = document.getElementById('tx-rows');
  const empty = document.getElementById('empty-state');
  document.getElementById('count-label').textContent = `Showing ${list.length} of ${allTx.length} transactions`;

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = list.map((t) => `
    <tr class="table-row">
      <td class="px-5 py-3 font-mono text-text-dim">${t.id}</td>
      <td class="px-5 py-3 font-mono">${t.fromAccount}</td>
      <td class="px-5 py-3 font-mono">${t.toAccount}</td>
      <td class="px-5 py-3 font-mono">${formatCurrency(t.amount, t.currency)}</td>
      <td class="px-5 py-3 text-text-dim">${t.channel}</td>
      <td class="px-5 py-3 font-mono">${t.riskScore.toFixed(2)}</td>
      <td class="px-5 py-3"><span class="${decisionBadgeClass(t.decision)}">${t.decision}</span></td>
      <td class="px-5 py-3 text-right text-text-faint">${formatDateTime(t.timestamp)}</td>
    </tr>
  `).join('');


}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const decision = document.getElementById('decision-filter').value;
  const sort = document.getElementById('sort').value;

  let filtered = allTx.filter((t) => {
    const matchesSearch = !search || t.id.toLowerCase().includes(search) || t.fromAccount.toLowerCase().includes(search) || t.toAccount.toLowerCase().includes(search);
    const matchesDecision = !decision || t.decision === decision;
    return matchesSearch && matchesDecision;
  });

  switch (sort) {
    case 'time-asc': filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); break;
    case 'risk-desc': filtered.sort((a, b) => b.riskScore - a.riskScore); break;
    case 'amount-desc': filtered.sort((a, b) => b.amount - a.amount); break;
    default: filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  renderRows(filtered);
}

async function init() {
  allTx = await getTransactions();
  applyFilters();

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('decision-filter').addEventListener('change', applyFilters);
  document.getElementById('sort').addEventListener('change', applyFilters);
}

init();
