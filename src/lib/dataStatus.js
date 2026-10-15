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
export function dataErrorCode(error,fallback='data/read-failed') {
  const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'');
  // RTDB get() can reject with a plain Error("Permission denied"), without .code.
  // Classify known SDK messages, but never persist raw server payloads or tokens.
  if(code.includes('permission')||code.includes('denied')||/permission[\s_-]*denied|insufficient permissions/i.test(message))return 'database/permission-denied';
  if(code.includes('timeout')||/timed?\s*out/i.test(message))return 'data/timeout';
  if(code.includes('network')||code.includes('unavailable')||/client is offline|network error|failed to fetch|connection (?:failed|closed)/i.test(message))return 'data/network-error';
  if(/index not defined|no index for/i.test(message))return 'database/index-required';
  if(/database.*(?:does not exist|not found)|invalid database url/i.test(message))return 'database/configuration-error';
  if(/^(?:auth|database|firestore|data|config)\/[a-z0-9-]{1,70}$/.test(code))return code;
  if(/^[a-z][a-z0-9-]{1,70}$/.test(code))return code;
  return fallback;
}
export function describeDataError(error) {
  const code = dataErrorCode(error);
  if (code.includes('email-unverified')) return 'Verify your email before loading workspace records.';
  if (code.includes('config/incomplete')) return 'The new Firebase project configuration is incomplete. Set its API key, auth domain, app ID and database URL together.';
  if (code.includes('permission') || code.includes('denied')) return 'Firebase denied access. Check the signed-in account and rules for this data path.';
  if (code==='database/index-required') return 'Firebase requires an index for this query. Ask the database administrator to check its query rules.';
  if (code==='database/configuration-error') return 'The Realtime Database address is invalid or the database does not exist. Check the project and exact database URL.';
  if (['auth/invalid-user-token','auth/user-token-expired'].includes(code)) return 'Your sign-in session has expired. Sign out and sign in again.';
  if (code.includes('session-required')) return 'Sign in to load Firebase records, or open the clearly labelled demo workspace.';
  if (code.includes('timeout') || code.includes('network') || code.includes('unavailable')) return 'The data source did not respond. Check your connection, then retry.';
  return 'Records could not be loaded. Check System status for the failed source and retry.';
}
export function withTimeout(operation, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('Data request timed out'); error.code = 'data/timeout'; reject(error); }, ms); });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
