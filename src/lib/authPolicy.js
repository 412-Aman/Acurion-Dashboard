// Browser-visible settings only; provider secrets stay in the Firebase console.
export const AUTH_PROVIDERS = [
  {id:'google',label:'Google',providerId:'google.com',flag:'VITE_AUTH_GOOGLE_ENABLED'},
  {id:'github',label:'GitHub',providerId:'github.com',flag:'VITE_AUTH_GITHUB_ENABLED'},
  {id:'apple',label:'Apple',providerId:'apple.com',flag:'VITE_AUTH_APPLE_ENABLED'},
];
export function authSettings(env) {
  return {
    enabled:env.VITE_AUTH_ENABLED==='true',
    registration:env.VITE_AUTH_SIGNUP_ENABLED==='true',
    providers:Object.fromEntries(AUTH_PROVIDERS.map(provider=>[provider.id,env[provider.flag]==='true'])),
  };
}
export function authErrorMessage(error) {
  const code=String(error?.code||'');
  const messages={
    'auth/not-configured':'Sign-in is not available for this workspace yet. You can explore the demo while setup is completed.',
    'auth/provider-not-configured':'This sign-in option is not available for this workspace yet. Try email sign-in or explore the demo.',
    'auth/signup-disabled':'Registration is not available yet. Ask your workspace administrator for access, or explore the demo.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/invalid-credential':'The email or password is incorrect. Please try again.',
    'auth/wrong-password':'The email or password is incorrect. Please try again.',
    'auth/user-not-found':'The email or password is incorrect. Please try again.',
    'auth/email-already-in-use':'An account already uses this email. Sign in or reset your password.',
    'auth/weak-password':'Use a stronger password that meets your workspace requirements.',
    'auth/password-does-not-meet-requirements':'The password does not meet this workspace’s password requirements.',
    'auth/too-many-requests':'Too many attempts. Wait a moment before trying again.',
    'auth/network-request-failed':'Check your internet connection and try again.',
    'auth/popup-blocked':'Your browser blocked the sign-in window. Allow popups for this site and try again.',
    'auth/popup-closed-by-user':'The sign-in window was closed. You can try again whenever you are ready.',
    'auth/cancelled-popup-request':'Another sign-in attempt is already in progress.',
    'auth/unauthorized-domain':'Sign-in is not enabled on this address. Contact your workspace administrator.',
    'auth/operation-not-allowed':'This sign-in method is not enabled for your workspace.',
    'auth/account-exists-with-different-credential':'This email uses a different sign-in method. Sign in with the original provider. Account linking requires a verified session.',
    'auth/expired-action-code':'This email link has expired. Request a new link.',
    'auth/invalid-action-code':'This email link is invalid or has already been used. Request a new link.',
    'auth/user-disabled':'This account has been disabled. Contact your workspace administrator.',
    'auth/requires-recent-login':'Sign in again before completing this action.',
    'auth/session-required':'Sign in first to verify your email.',
    'config/incomplete':'Workspace sign-in setup is incomplete. Contact your workspace administrator or explore the demo.',
  };
  return messages[code] || 'This action could not be completed. Please try again.';
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
  return Boolean(user && !user.emailVerified && user.providerData?.some(provider=>provider.providerId==='password'));
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
