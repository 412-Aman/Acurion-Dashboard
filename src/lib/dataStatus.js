const records = new Map();
const listeners = new Set();
export function getDataStatus() { return [...records.values()].map(record => ({ ...record })); }
export function setDataStatus(resource, update) {
  records.set(resource, { resource, ...records.get(resource), ...update });
  for (const listener of listeners) listener(getDataStatus());
}
export function observeDataStatus(listener) {
  listeners.add(listener);
  listener(getDataStatus());
  return () => listeners.delete(listener);
}
export function describeDataError(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('email-unverified')) return 'Verify your email before loading workspace records.';
  if (code.includes('config/incomplete')) return 'The new Firebase project configuration is incomplete. Set its API key, auth domain, app ID and database URL together.';
  if (code.includes('permission') || code.includes('denied')) return 'Firebase denied access. Check the signed-in account and rules for this data path.';
  if (code.includes('session-required')) return 'Sign in to load Firebase records, or open the clearly labelled demo workspace.';
  if (code.includes('timeout') || code.includes('network') || code.includes('unavailable')) return 'The data source did not respond. Check your connection, then retry.';
  return 'Records could not be loaded. Check System status for the failed source and retry.';
}
export function withTimeout(operation, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('Data request timed out'); error.code = 'data/timeout'; reject(error); }, ms); });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
