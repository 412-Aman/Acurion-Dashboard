// Turns model output into plain-English evidence for analysts: each reason's contribution as a bar, and an
// uploaded dataset's laundering network as its shape, risk and members.
import { escapeHTML as esc } from './icons.js';

// K7 and the upload models already send their reasons as sentences. Older records used feature names
// such as "sender_has_paid_receiver_before" or "payment_format = ACH"; those are made readable here.
export function describeFeature({ feature, encodedValue }) {
  const [name, category] = String(feature).split(' = ');
  const label = name.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  if (category !== undefined) return { label, value: category };
  const v = Number(encodedValue);
  return { label, value: encodedValue == null || !Number.isFinite(v) ? '' : v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) };
}

export const contributionNote = (explanation, model = 'model') => model === 'k7'
  ? 'K7 averages its three trained models. Bars show how much each reason raised (orange) or lowered (grey) this alert’s score, in model log-odds. They explain the score, not intent.'
  : `${explanation?.method || 'Tree contributions'}. Bars show how much each reason raised (orange) or lowered (grey) this alert’s score, in model log-odds. They explain the score, not intent.`;

export function contributionChart(explanation, { model = 'model', note: withNote = true } = {}) {
  const features = (explanation?.topFeatures || []).filter(f => typeof f.feature === 'string' && Number.isFinite(f.impact));
  if (!features.length) return '';
  const max = Math.max(...features.map(f => Math.abs(f.impact)), 0.0001);
  const note = model === 'k7'
    ? 'K7 averages its three trained models. Bars show how much each reason raised (orange) or lowered (grey) this alert’s score, in model log-odds. They explain the score, not intent.'
    : `${esc(explanation.method || 'Tree contributions')}. Bars show how much each reason raised (orange) or lowered (grey) this alert’s score, in model log-odds. They explain the score, not intent.`;
  return `<div class="contribution-chart" role="list">${features.map(f => {
    const { label, value } = describeFeature(f);
    const width = Math.max(3, Math.round(Math.abs(f.impact) / max * 100));
    return `<div class="contribution-row" role="listitem"><div class="contribution-label"><strong>${esc(label)}</strong>${value ? `<span>${esc(value)}</span>` : ''}</div><div class="contribution-bar ${f.impact >= 0 ? 'up' : 'down'}" aria-hidden="true"><i style="width:${width}%"></i></div><span class="contribution-value">${f.impact >= 0 ? '+' : '−'}${Math.abs(f.impact).toFixed(2)}</span></div>`;
  }).join('')}</div>${withNote ? `<p class="helper">${note}</p>` : ''}`;
}

const PATTERNS = {
  'ROUND-TRIP': 'Round trip', 'PASS-THROUGH': 'Pass-through', 'FAN-IN': 'Fan-in', 'FAN-OUT': 'Fan-out', CHAIN: 'Chain', CYCLE: 'Cycle',
  'SCATTER-GATHER': 'Scatter-gather', 'GATHER-SCATTER': 'Gather-scatter', STACK: 'Stack', BIPARTITE: 'Bipartite', SIMPLE: 'Linked transfers',
};
export const patternName = pattern => PATTERNS[pattern] || String(pattern || 'Network').toLowerCase().replace(/^./, c => c.toUpperCase());

// A network found in an uploaded dataset (written by the host bridge to /networkReviews).
export function networkReview(network, { linkToGraph = true } = {}) {
  if (!network) return '';
  const risk = Number(network.risk), pct = `${Math.max(0, Math.min(100, risk * 100)).toFixed(1)}%`;
  const fixed = v => (Math.floor(v * 1000) / 1000).toFixed(3);
  const roles = (network.roles || []).slice(0, 4).map(r => `${esc(r.role)}: <span class="pii">${esc(r.account)}</span>`).join('<br>');
  return `<div class="network-review"><div class="network-meter" aria-label="Network risk ${fixed(risk)}"><div class="network-meter-track"><i style="width:${pct}"></i></div><div class="network-meter-legend"><span><strong>${Number.isFinite(risk) ? fixed(risk) : '–'}</strong> network risk</span><span>${esc(patternName(network.pattern))}</span></div></div><dl class="network-facts"><div><dt>Accounts</dt><dd>${network.accounts?.length ?? '–'}</dd></div><div><dt>Transfers</dt><dd>${network.transfers ?? network.transactionIds?.length ?? '–'}</dd></div><div><dt>High-risk transfers</dt><dd>${network.highRiskTransfers ?? '–'}</dd></div><div><dt>Shown here</dt><dd>${network.transactionIds?.length ?? 0}</dd></div></dl><p class="helper">${esc(network.description || '')}${network.fileName ? ` Found in ${esc(network.fileName)}.` : ''}</p>${roles ? `<p class="helper network-roles">${roles}</p>` : ''}${linkToGraph && network.networkId ? `<a class="btn-ghost" href="graph.html?network=${encodeURIComponent(network.networkId)}">Open network in graph</a>` : ''}</div>`;
}
