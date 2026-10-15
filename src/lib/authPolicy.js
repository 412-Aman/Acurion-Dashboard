// Browser-visible settings only; provider secrets stay in the Firebase console.
export const AUTH_PROVIDERS = [
  {id:'google',label:'Google',providerId:'google.com'},
  {id:'github',label:'GitHub',providerId:'github.com'},
];
export function authSettings(env) {
  return {
    // Email sign-in uses the configured Firebase project unless explicitly paused.
    enabled:env.VITE_AUTH_ENABLED!=='false',
    registration:env.VITE_AUTH_SIGNUP_ENABLED!=='false',
    // Firebase owns provider availability. Old build flags must not block enabled providers.
    providers:Object.fromEntries(AUTH_PROVIDERS.map(provider=>[provider.id,true])),
  };
}
export function authErrorMessage(error) {
  const code=String(typeof error==='string'?error:error?.code||'');
  const messages={
    'auth/not-configured':'Sign-in is not available for this workspace yet. You can explore the demo while setup is completed.',
    'auth/unsupported-provider':'Choose Google, GitHub or email to sign in. This sign-in provider is not supported by Acurion.',
    'auth/signup-disabled':'Registration is not available yet. Ask your workspace administrator for access, or explore the demo.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/invalid-credential':'The email or password is incorrect. Please try again.',
    'auth/wrong-password':'The email or password is incorrect. Please try again.',
    'auth/user-not-found':'The email or password is incorrect. Please try again.',
    'auth/email-already-in-use':'An account already uses this email. Sign in or reset your password.',
    'auth/weak-password':'Use a stronger password that meets your workspace requirements.',
    'auth/password-does-not-meet-requirements':'The password does not meet this workspace’s password requirements.',
    'auth/too-many-requests':'Firebase temporarily blocked this request after too many attempts. Stop retrying for now. Try again later; Firebase does not provide an exact unlock time. If you were signing in, you can also use Forgot password.',
    'auth/verification-cooldown':'A verification request was made recently. Check your inbox and spam folder before requesting another email.',
    'auth/network-request-failed':'Check your internet connection and try again.',
    'auth/popup-blocked':'Your browser blocked the sign-in window. Allow popups for this site and try again.',
    'auth/popup-closed-by-user':'The sign-in window was closed. You can try again whenever you are ready.',
    'auth/cancelled-popup-request':'Another sign-in attempt is already in progress.',
    'auth/unauthorized-domain':'Firebase has not approved this website address for sign-in. Ask your administrator to add this domain under Authentication → Settings → Authorized domains, then reload this page.',
    'auth/unauthorized-continue-uri':'Firebase rejected the email’s return address. Ask your administrator to authorize the website domain in Authentication settings.',
    'auth/invalid-continue-uri':'The email return address is invalid. Contact your workspace administrator.',
    'auth/invalid-sender':'Firebase rejected the verification email’s sender name or address. Your administrator needs to fix the Authentication email template.',
    'auth/invalid-message-payload':'Firebase rejected the verification email template. Your administrator needs to check its contents in Authentication templates.',
    'auth/invalid-recipient-email':'Firebase could not send to this account’s email address. Check the address shown on this page.',
    'auth/missing-email':'This account has no email address to verify. Use a different sign-in account that shares an email address, or ask your administrator for help.',
    'auth/invalid-user-token':'Your sign-in session is no longer valid. Sign out and sign in again before requesting verification.',
    'auth/user-token-expired':'Your sign-in session has expired. Sign out and sign in again before requesting verification.',
    'auth/internal-error':'Firebase could not complete the request (auth/internal-error). Your administrator needs to check the Firebase response before retrying.',
    'auth/quota-exceeded':'Firebase’s sending quota has been reached. Your administrator needs to check the project’s Authentication usage.',
    'auth/verification-send-failed':'The verification email request failed. Wait before trying again, or contact your workspace administrator.',
    'auth/operation-not-allowed':'This sign-in method is disabled in Firebase. Ask your administrator to enable it under Authentication → Sign-in method, or use another enabled sign-in option.',
    'auth/account-exists-with-different-credential':'This email uses a different sign-in method. Sign in with the original provider. Account linking requires a verified session.',
    'auth/expired-action-code':'This email link has expired. Request a new link.',
    'auth/invalid-action-code':'This email link is invalid or has already been used. Request a new link.',
    'auth/user-disabled':'This account has been disabled. Contact your workspace administrator.',
    'auth/requires-recent-login':'Sign in again before completing this action.',
    'auth/session-required':'Sign in first to verify your email.',
    'auth/email-unverified':'You cannot open workspace records yet because your email is not verified. Open the verification link in your inbox, then select “I’ve verified my email”.',
    'config/incomplete':'Workspace sign-in setup is incomplete. Contact your workspace administrator or explore the demo.',
  };
  if(messages[code])return messages[code];
  // Show only bounded public SDK codes, never arbitrary error messages or tokens.
  if(/^auth\/[a-z0-9-]{1,70}$/.test(code))return `Firebase could not complete this action (${code}). Share this code with your workspace administrator.`;
  return 'The request failed without a recognised error code. Check your connection and try once more. If it still fails, tell your administrator which action failed and when.';
}
export function validateRegistration({name,email,password,confirmation}) {
  const errors=[];
  if(typeof name!=='string'||!name.trim()||name.trim().length>100)errors.push('Enter your name, up to 100 characters.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim()))errors.push('Enter a valid email address.');
  if(typeof password!=='string'||password.length<12||password.length>128)errors.push('Use between 12 and 128 characters for your password.');
  if(password!==confirmation)errors.push('The passwords do not match.');
  return errors;
}
export function requiresEmailVerification(user) {
  return Boolean(user && !user.emailVerified);
}
export function safeReturnPath(value,origin='https://acurion.invalid') {
  if(!value)return 'index.html';
  try {
    const target=new URL(value,origin),base=new URL(origin);
    const page=target.pathname.split('/').pop();
    if(target.origin!==base.origin||!['index.html','alerts.html','transactions.html','graph.html','compliance.html','reports.html','system.html'].includes(page))return 'index.html';
    return `${page}${target.search}${target.hash}`;
  }catch{return 'index.html';}
}
