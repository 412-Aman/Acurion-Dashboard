// Small visual building blocks shared by the Overview and Alerts pages: a risk meter instead of a bare score,
// plain-language reason chips with icons instead of rule codes, and a chip for where an alert came from.
import { escapeHTML as esc } from './icons.js';
import { formatRisk } from '../lib/utils.js';

const svg = (path, size = 15) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5M5 11.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2M3 9h18"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5"/><path d="m17.5 3.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h4M14.5 13.5h3"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  stairs: '<path d="M4 19h4v-4h4v-4h4V7h4"/><path d="M4 7h7m-3-3 3 3-3 3"/>',
  stack: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>',
  trend: '<path d="m4 16 5-5 4 4 7-7"/><path d="M15 8h5v5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
  news: '<rect x="4" y="4" width="13" height="16" rx="1.5"/><path d="M17 8h2.5v10A2 2 0 0 1 17 20M7.5 8h6M7.5 12h6M7.5 16h4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.2"/>',
  userx: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.8-3.5 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9M16 15l5 5m0-5-5 5"/>',
  exchange: '<path d="M4 8h13m-3-3 3 3-3 3M20 16H7m3-3-3 3 3 3"/>',
  network: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="m8.2 7 7.4.7M7 8.3l2.2 7.4M16.4 10l-4.6 6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  rules: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="m3.5 6 1 1 1.8-2M3.5 12l1 1 1.8-2M3.5 18l1 1 1.8-2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
};
export const visualIcon = (name, size) => svg(ICONS[name] || ICONS.spark, size);

// Rule codes in plain words. The rule's own sentence stays available under "More info".
const RULES = {
  THRESHOLD: ['coins', 'Large amount for this customer'],
  INCOME: ['wallet', 'More than their income suggests'],
  PEP: ['person', 'Politically exposed person'],
  PEP_MATCH: ['person', 'Counterparty is politically exposed'],
  KYC: ['id', 'Customer checks not finished'],
  VELOCITY: ['bolt', 'Many transfers in a short time'],
  STRUCTURING: ['stairs', 'Amounts kept just under the limit'],
  BULK: ['stack', 'Several large transfers'],
  TURNOVER: ['trend', 'More money moving than expected'],
  JURISDICTION: ['globe', 'Sent to a high-risk country'],
  SANCTION_CONFIRMED: ['shield', 'Sanctions match'],
  MEDIA: ['news', 'Negative news about them'],
  SCREENING_PENDING: ['search', 'Possible watchlist match'],
  FX_REQUIRED: ['exchange', 'Different currency from their profile'],
  DATA_QUALITY: ['warn', 'Key details missing'],
  PROFILE_MISSING: ['userx', 'No customer profile'],
};

// 0 to 1, whatever produced the alert: rule points out of 100, or a model score.
export function riskShare(alert) {
  if (alert.ruleScore != null) return Math.max(0, Math.min(1, alert.ruleScore / 100));
  return alert.riskScore == null || !Number.isFinite(alert.riskScore) ? null : Math.max(0, Math.min(1, alert.riskScore));
}
export const riskText = alert => alert.ruleScore != null ? `${alert.ruleScore}` : formatRisk(alert.riskScore);
const tone = severity => ['critical', 'high', 'medium', 'low'].includes(severity) ? severity : 'unknown';

// A short bar that fills with the risk, coloured by severity, with the number beside it.
export function riskMeter(alert, { size = 'sm' } = {}) {
  const share = riskShare(alert);
  if (share == null) return `<span class="risk-meter is-${size}" data-tone="unknown"><span class="risk-meter-track"></span><b>Not scored</b></span>`;
  return `<span class="risk-meter is-${size}" data-tone="${tone(alert.severity)}" role="img" aria-label="Risk ${esc(riskText(alert))}${alert.ruleScore != null ? ' out of 100' : ''}"><span class="risk-meter-track"><i style="width:${Math.max(4, Math.round(share * 100))}%"></i></span><b>${esc(riskText(alert))}</b></span>`;
}

// Why it was flagged, as icon chips: rule reasons first, then a model's own sentences, then its top features.
export function reasonChips(alert, { limit = 6 } = {}) {
  const reasons = alert.ruleAssessment?.reasons;
  if (Array.isArray(reasons) && reasons.length) return reasons.slice(0, limit).map(r => {
    const [name, label] = RULES[r.code] || ['spark', r.message || r.code];
    return { icon: name, label, points: Number.isFinite(r.points) ? r.points : null, detail: r.message || '' };
  });
  if (alert.reasons?.length) return alert.reasons.slice(0, limit).map(text => ({ icon: 'spark', label: text, points: null, detail: '' }));
  const features = (alert.shapExplanation?.topFeatures || []).filter(f => typeof f.feature === 'string' && Number.isFinite(f.impact) && f.impact > 0);
  if (features.length) return features.slice(0, limit).map(f => ({ icon: 'spark', label: String(f.feature).split(' = ')[0].replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()), points: null, detail: '' }));
  if (alert.reason) return alert.reason.split(/;\s*/).filter(Boolean).slice(0, limit).map(text => ({ icon: 'spark', label: text, points: null, detail: '' }));
  return [];
}
export function reasonChipList(alert, options) {
  const chips = reasonChips(alert, options);
  return chips.length ? `<ul class="reason-chips">${chips.map(c => `<li>${visualIcon(c.icon, 16)}<span>${esc(c.label)}</span>${c.points != null ? `<b>+${c.points}</b>` : ''}</li>`).join('')}</ul>` : '';
}

// Where an alert came from, as a small chip.
export function sourceKind(alert) { return alert.uploadId ? 'upload' : /\bK7\b/.test(alert.modelVersion || '') ? 'k7' : alert.ruleScore != null ? 'rules' : 'other'; }
export function sourceChip(alert) {
  const kind = sourceKind(alert);
  const [name, label] = kind === 'k7' ? ['live', 'K7 live'] : kind === 'upload' ? ['file', alert.sourceDataset ? alert.sourceDataset.replace(/^Upload(ed)?\s*[·:]?\s*/i, '') : 'Uploaded file'] : kind === 'rules' ? ['rules', 'Rules'] : ['spark', alert.sourceDataset || 'Other source'];
  return `<span class="source-chip" data-kind="${kind}">${visualIcon(name, 13)}<span>${esc(label)}</span></span>`;
}
