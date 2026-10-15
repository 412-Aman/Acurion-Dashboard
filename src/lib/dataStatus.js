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
// Cached documents can return through Back/Forward. Resume their status subscription.
export function observePageDataStatus(listener,page=window) {
  let unsubscribe=observeDataStatus(listener);
  const suspend=()=>{unsubscribe?.();unsubscribe=null;};
  const resume=()=>{if(!unsubscribe)unsubscribe=observeDataStatus(listener);};
  page.addEventListener('pagehide',suspend);
  page.addEventListener('pageshow',resume);
  return ()=>{suspend();page.removeEventListener('pagehide',suspend);page.removeEventListener('pageshow',resume);};
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
export function dataErrorDetails(error, { operation='read', path='', user } = {}) {
  const code=dataErrorCode(error),write=operation==='write';
  const source=path?` at /${String(path).replace(/^\/+/, '')}`:'';
  const result=(title,message,label='Check access details',href='system.html#access-help',retry=false)=>({code,title,message,label,href,retry});
  if(code==='auth/email-unverified' || (code==='database/permission-denied' && user?.emailVerified===false))
    return result('Verify your email to continue',`You cannot ${write?'save this review':'open these records'} because your email is not verified. Open the verification link in your inbox, then select “I’ve verified my email”.`,'Verify my email','verify-email.html');
  if(code==='auth/session-required')return result('Sign in to continue',`You cannot ${write?'save this review':'load workspace records'} because you are not signed in. Sign in with your approved workspace account.`,'Sign in','login.html');
  if(['auth/invalid-user-token','auth/user-token-expired'].includes(code))return result('Your session has expired','Sign out and sign in again to renew your session. Your account and existing records have not been deleted.','Sign in again','login.html?reauth=1');
  if(code==='database/permission-denied')return write
    ? result('Review was not saved','Firebase denied access to save this review and its audit event. Ask your administrator to enable validated analyst writes for your account on both the alert and audit paths. Read-only rules allow viewing records but block saving.')
    : result('Your account cannot access these records',`Firebase denied access${source}. Ask your administrator to check your Account ID in approvedUsers and read permission for this exact path. Email verification alone does not grant workspace access.`);
  if(code==='config/incomplete' || code==='database/configuration-error')return result('The database connection needs setup','Ask your administrator to check the Firebase project ID, API key, auth domain, app ID and exact Realtime Database URL. Then check the connection again.');
  if(code==='database/index-required')return result('This query needs a database index','Ask your administrator to add the index required by this query in Realtime Database Rules, then retry.');
  if(code==='auth/user-disabled')return result('Your account has been disabled','Ask your workspace administrator to restore your account before trying again.');
  if(code.includes('timeout') || code.includes('network') || code.includes('unavailable'))return write
    ? result('Save could not be confirmed','The connection ended before Firebase confirmed the save. Reopen this alert and check Audit activity before saving again, to avoid a duplicate event.','Check audit activity','reports.html#audit')
    : result('The data source did not respond','Check your internet connection, then retry. If this keeps happening, ask your administrator to check the database connection.','Check System status','system.html',true);
  return write
    ? result('Review could not be saved','Check System status for the failed write and share the diagnostic code with your administrator. Your entered review is still on this page.')
    : result('Records could not be loaded','Retry once. If the problem continues, open System status and share the source path and diagnostic code with your administrator.','Check System status','system.html',true);
}
export function describeDataError(error,context) { return dataErrorDetails(error,context).message; }
export function withTimeout(operation, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('Data request timed out'); error.code = 'data/timeout'; reject(error); }, ms); });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
