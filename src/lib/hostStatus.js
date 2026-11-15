// Pure helpers for the Acurion host's status (K7 live detection and upload scoring).
// The host bridge (host/acurion_bridge.py) writes /hostDesk/status about once a second; the website
// only ever reads it, so everything here works on plain values and is unit tested.

// The host counts as offline when its status is older than this.
export const STALE_MS = 15000;
export const K7_STATES = ['getting ready', 'ready', 'running', 'paused', 'finished', 'failed', 'offline'];
const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
const text = value => value == null ? '' : String(value);
const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

export function normalizeRecentAlert(item) {
  const score = number(item?.riskScore);
  return {
    alertId: text(item?.alertId), accountId: text(item?.accountId) || 'Not supplied',
    riskScore: score != null && score >= 0 && score <= 1 ? score : null,
    severity: ['critical', 'high', 'medium', 'low'].includes(item?.severity) ? item.severity : 'high',
    timestamp: text(item?.timestamp) || null,
    // K7 prefixes its reasons with the list the alert came from; the list is shown separately.
    reason: text(item?.reason).replace(/^K7's (alert|watch) list[^:]*:\s*/i, ''),
  };
}

// raw: the /hostDesk/status value; now: the server's current time in milliseconds.
export function normalizeHostStatus(raw, now, { signedIn = true } = {}) {
  if (!signedIn) return { connection: 'signed-out', lastSeen: null, k7: offlineK7(''), uploads: { state: 'offline', problem: '' } };
  if (raw === undefined) return { connection: 'loading', lastSeen: null, k7: offlineK7(''), uploads: { state: 'offline', problem: '' } };
  if (!raw || typeof raw !== 'object') return { connection: 'never', lastSeen: null, k7: offlineK7('The Acurion host has not connected yet.'), uploads: { state: 'offline', problem: '' } };
  const lastSeen = number(raw.updatedAt);
  const fresh = lastSeen != null && now - lastSeen <= STALE_MS && !raw.stopped;
  if (!fresh) return { connection: 'stale', lastSeen, k7: offlineK7('The Acurion host is offline.'), uploads: { state: 'offline', problem: '' } };
  const k7 = raw.k7 || {};
  const state = K7_STATES.includes(k7.state) ? k7.state : 'offline';
  const sent = number(k7.sent) ?? 0, total = number(k7.total) ?? 0;
  return {
    connection: 'online', lastSeen,
    k7: {
      state, problem: text(k7.problem), sent, total,
      progress: total > 0 ? Math.min(1, Math.max(0, sent / total)) : 0,
      speed: number(k7.speed), alerts: number(k7.alerts) ?? 0, watch: number(k7.watch) ?? 0,
      paymentTime: text(k7.payment_time) || null, model: text(k7.model) || 'Acurion K7', dataset: text(k7.dataset),
      copyProblem: text(k7.copy_problem), recent: list(k7.recent).map(normalizeRecentAlert).filter(a => a.alertId),
    },
    uploads: { state: ['ready', 'busy'].includes(raw.uploads?.state) ? raw.uploads.state : 'offline', problem: text(raw.uploads?.problem) },
  };
}
function offlineK7(problem) {
  return { state: 'offline', problem, sent: 0, total: 0, progress: 0, speed: null, alerts: 0, watch: 0, paymentTime: null, model: 'Acurion K7', dataset: '', copyProblem: '', recent: [] };
}

export const canControlDesk = role => ['reviewer', 'admin'].includes(role);
export const canStart = status => status.connection === 'online' && ['ready', 'paused'].includes(status.k7.state);
export const canPause = status => status.connection === 'online' && status.k7.state === 'running';

// One plain sentence per state, shared by the Overview card and the header island.
export function describeK7(status) {
  if (status.connection === 'signed-out') return 'K7 runs on the team’s Acurion host. Its live alerts reach every signed-in investigator.';
  if (status.connection === 'loading') return 'Checking the Acurion host…';
  if (status.connection === 'never') return 'The Acurion host has not connected yet. Start the bridge on the host computer.';
  if (status.connection === 'stale') return `The Acurion host is offline${status.lastSeen ? `. Last seen ${relativeTime(status.lastSeen, Date.now())}` : ''}.`;
  const k7 = status.k7;
  return ({
    'getting ready': 'K7 is loading two weeks of payment history. This takes 1 to 6 minutes.',
    ready: 'Waiting for Start. K7 then streams the recorded payments and checks each one as it arrives.',
    running: 'Checking payments as they arrive.',
    paused: 'Start carries on from the payment where it stopped.',
    finished: 'The recording has played through. The host team rebuilds K7’s store to run it again.',
    failed: k7.problem || 'K7 stopped with a problem on the host.',
    offline: k7.problem || 'K7 is not running on the host.',
  })[k7.state];
}

export function relativeTime(then, now) {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

// Alerts in `next` that were not in `previous` (newest first), for the live notification.
export function newRecentAlerts(previous, next) {
  if (!previous) return [];
  const seen = new Set(previous.map(a => a.alertId));
  return next.filter(a => !seen.has(a.alertId));
}

export const formatCount = value => Number(value || 0).toLocaleString('en-GB');
