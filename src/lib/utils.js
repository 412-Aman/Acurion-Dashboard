export function cn(...classes) { return classes.filter(Boolean).join(' '); }

export function formatCurrency(value, currency = 'AED') {
  if (value == null || !Number.isFinite(Number(value))) return 'Amount not supplied';
  if (!currency) return `${Number(value).toLocaleString()} (currency not supplied)`;
  if (!/^[A-Z]{3}$/.test(currency)) return `${Number(value).toLocaleString()} (invalid currency)`;
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function formatTimeAgo(isoString) {
  if (!isoString || !Number.isFinite(Date.parse(isoString))) return 'Time not supplied';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Records are shown in UTC so dataset times, model runs and analyst actions line up.
export function formatDateTime(isoString) {
  if (!isoString || !Number.isFinite(Date.parse(isoString))) return 'Time not recorded';
  const date = new Date(isoString), sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return `${date.toLocaleString('en-GB', { day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

export function riskColor(score) {
  if (score > 0.85) return 'text-crit';
  if (score > 0.6)  return 'text-danger';
  if (score > 0.35) return 'text-warn';
  return 'text-ok';
}

export function severityBadgeClass(severity) {
  switch (severity) {
    case 'critical': return 'badge badge-critical';
    case 'high':     return 'badge badge-high';
    case 'medium':   return 'badge badge-medium';
    case 'low':      return 'badge badge-low';
    default:         return 'badge badge-neutral';
  }
}

export function decisionBadgeClass(decision) {
  switch (decision) {
    case 'block': return 'badge badge-block';
    case 'flag': return 'badge badge-flag';
    case 'pass': return 'badge badge-pass';
    default: return 'badge badge-neutral';
  }
}
// Model scores are uncalibrated, so they are shown as 0-1 scores, never as percentages.
export function formatRisk(score) { return score == null || !Number.isFinite(score) ? 'Not scored' : (Math.floor(score * 1000) / 1000).toFixed(3); }

export function $(selector, root = document) {
  return root.querySelector(selector);
}
export function $all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}
