import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { renderLayout } from '../components/layout.js';
import { mountGatewayFlow } from '../islands/ambient.tsx';
import {
  getOverviewStats,
  getAlerts,
  getSeverityBreakdown,
  getRiskTimeline,
  subscribeToUpdates,
} from '../lib/dataService.js';
import { formatTimeAgo, decisionBadgeClass, severityBadgeClass } from '../lib/utils.js';

const main = renderLayout({
  active: 'index.html',
  pageTitle: 'Overview',
  pageSubtitle: 'Real-time financial network intelligence summary',
});

main.innerHTML = `
<section class="intelligence-banner"><div class="banner-flow" id="overview-flow" aria-hidden="true"></div><div class="banner-copy"><span class="section-kicker">ACURION INTELLIGENCE</span><h2>Follow the flow. Find the signal.</h2><p>Transaction activity, customer context and investigation decisions.</p></div><a class="btn-ghost" href="compliance.html?view=cases">Open investigations ↗</a></section>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="stat-cards"></div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
    <div class="card lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-semibold">Risk Score Trend</h3>
          <p class="text-xs text-text-faint mt-0.5">Average network risk score over last 24h</p>
        </div>
      </div>
      <div id="risk-chart" class="h-64"></div>
    </div>

    <div class="card">
      <div class="mb-4">
        <h3 class="font-semibold">Alert Severity</h3>
        <p class="text-xs text-text-faint mt-0.5">Distribution of active alerts</p>
      </div>
      <div id="severity-chart" class="space-y-3"></div>
    </div>
  </div>

  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="font-semibold">Recent Alerts</h3>
        <p class="text-xs text-text-faint mt-0.5">Latest flagged and blocked transactions</p>
      </div>
      <a href="alerts.html" class="btn-ghost text-xs">View all</a>
    </div>
    <div id="recent-alerts" class="overflow-x-auto"></div>
  </div>
`;

mountGatewayFlow(document.getElementById('overview-flow'), true);

const STAT_DEFS = [
  { key: 'totalTransactions24h', label: 'Loaded transactions', icon: iconActivity() },
  { key: 'totalAlerts', label: 'Loaded alerts', icon: iconAlert() },
  { key: 'blockedTransactions', label: 'Blocked', icon: iconBlock() },
  { key: 'flaggedTransactions', label: 'Flagged transactions', icon: iconTarget() },
];

function iconActivity() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
}
function iconAlert() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}
function iconBlock() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
}
function iconTarget() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
}

async function renderStats() {
  const stats = await getOverviewStats();
  const el = document.getElementById('stat-cards');
  el.innerHTML = STAT_DEFS.map((def) => {
    const raw = stats[def.key];
    return `
      <div class="stat-card">
        <div class="flex items-center justify-between mb-3">
          <span class="text-text-faint">${def.icon}</span>
        </div>
        <div class="text-2xl font-semibold tracking-tight font-mono" data-target="${raw}" data-format="${def.format ? 'pct' : 'plain'}" data-suffix="${def.suffix || ''}">${Number(raw).toLocaleString()}</div>
        <div class="text-sm text-text-faint mt-1">${def.label}</div>
      </div>
    `;
  }).join('');


}

async function renderRiskChart() {
  const data = await getRiskTimeline();
  const el = document.getElementById('risk-chart');
  const w = 700, h = 240, pad = 24;
  const max = Math.max(...data.map((d) => d.avgRisk), 1);
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - (d.avgRisk / max) * (h - pad * 2);
    return [x, y];
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${h - pad} L ${points[0][0]} ${h - pad} Z`;

  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="#eeeeee" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#eeeeee" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad + t * (h - pad * 2);
        return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#303030" stroke-width="1" stroke-dasharray="4 4"/>`;
      }).join('')}
      <path id="area-path" d="${areaPath}" fill="url(#areaGrad)" opacity="0"/>
      <path id="line-path" d="${linePath}" fill="none" stroke="#eeeeee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#101010" stroke="#eeeeee" stroke-width="1.5" class="risk-pt" data-i="${i}"/>`).join('')}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-faint);margin-top:8px;font-family:var(--font-mono);">
      <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
    </div>
  `;

  const linePathEl = document.getElementById('line-path');
  const len = linePathEl.getTotalLength();
  linePathEl.style.strokeDasharray = `${len} ${len}`;
  linePathEl.style.strokeDashoffset = `${len}`;
  animate(linePathEl, {
    strokeDashoffset: [len, 0],
    duration: 1600,
    ease: 'outQuad',
  });
  animate('#area-path', { opacity: [0, 1], duration: 1000, delay: 600, ease: 'outQuad' });
  animate('.risk-pt', { opacity: [0, 1], scale: [0, 1], delay: stagger(40, { start: 400 }), duration: 400, ease: 'outBack' });
}

async function renderSeverityChart() {
  const data = await getSeverityBreakdown();
  const el = document.getElementById('severity-chart');
  const max = Math.max(...data.map((d) => d.count), 1);
  const SEVERITY_COLORS = {
    low:      '#b3b3b3',
    medium:   '#c5c5c5',
    high:     '#dedede',
    critical: '#ffffff',
  };
  el.innerHTML = data.map((d) => {
    const color = SEVERITY_COLORS[d.severity] || '#929292';
    return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
        <span style="color:var(--color-text-dim);text-transform:capitalize;">${d.severity}</span>
        <span style="font-family:var(--font-mono);color:var(--color-text-faint);">${d.count}</span>
      </div>
      <div style="height:4px;border-radius:99px;background:var(--color-surface-3);overflow:hidden;">
        <div class="severity-bar" data-width="${(d.count / max) * 100}" style="width:0%;height:100%;border-radius:99px;background:${color};"></div>
      </div>
    </div>
  `}).join('');

  document.querySelectorAll('.severity-bar').forEach((bar, i) => {
    animate(bar, {
      width: [`0%`, `${bar.dataset.width}%`],
      duration: 800,
      delay: 200 + i * 120,
      ease: 'outQuad',
    });
  });
}

async function renderRecentAlerts() {
  const alerts = await getAlerts();
  const recent = [...alerts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);
  const el = document.getElementById('recent-alerts');
  el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-text-faint text-xs uppercase tracking-wide">
          <th class="pb-3 font-medium">Alert</th>
          <th class="pb-3 font-medium">Account</th>
          <th class="pb-3 font-medium">Risk Score</th>
          <th class="pb-3 font-medium">Severity</th>
          <th class="pb-3 font-medium">Decision</th>
          <th class="pb-3 font-medium text-right">Time</th>
        </tr>
      </thead>
      <tbody id="alert-rows"></tbody>
    </table>
  `;
  const tbody = document.getElementById('alert-rows');
  tbody.innerHTML = recent.map((a) => `
    <tr class="table-row">
      <td class="py-3 font-mono text-text-dim">${a.id}</td>
      <td class="py-3 font-mono">${a.suspiciousAccount}</td>
      <td class="py-3 font-mono">${a.riskScore.toFixed(2)}</td>
      <td class="py-3"><span class="badge ${severityBadgeClass(a.severity)}">${a.severity}</span></td>
      <td class="py-3"><span class="${decisionBadgeClass(a.decision)}">${a.decision}</span></td>
      <td class="py-3 text-right text-text-faint">${formatTimeAgo(a.timestamp)}</td>
    </tr>
  `).join('');


}

function showLiveToast(alert) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 glass-panel px-4 py-3 flex items-center gap-3 shadow-2xl z-50';
  toast.style.opacity = '0';
  toast.innerHTML = `
    <span class="pulse-dot"></span>
    <div class="text-sm">
      <div class="font-medium">New alert: ${alert.id}</div>
      <div class="text-text-faint text-xs font-mono">${alert.suspiciousAccount} · risk ${alert.riskScore.toFixed(2)}</div>
    </div>
  `;
  document.body.appendChild(toast);
  animate(toast, { opacity: [0, 1], translateY: [20, 0], duration: 400, ease: 'outQuad' });
  setTimeout(() => {
    animate(toast, {
      opacity: [1, 0],
      translateY: [0, 20],
      duration: 400,
      ease: 'inQuad',
      onComplete: () => toast.remove(),
    });
  }, 5000);
}

renderStats();
renderRiskChart();
renderSeverityChart();
renderRecentAlerts();

subscribeToUpdates('alerts', (update) => {
  if (update.type === 'new_alert') showLiveToast(update.item);
});
