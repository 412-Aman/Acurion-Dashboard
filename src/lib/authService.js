import { GoogleAuthProvider,GithubAuthProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,updateProfile,reload,verifyPasswordResetCode,confirmPasswordReset,applyActionCode,checkActionCode,signOut } from 'firebase/auth';
import { auth,configurationIssues,firebaseConfig } from './firebase.js';
import { authSettings,validateRegistration } from './authPolicy.js';
import { createVerificationDelivery } from './verificationDelivery.js';
export const AUTH_SETTINGS=authSettings(import.meta.env);
let verificationStorage;
try{verificationStorage=localStorage;}catch{}
const verificationDelivery=createVerificationDelivery({
  storage:verificationStorage,namespace:firebaseConfig.projectId,
  send:user=>sendEmailVerification(user,{url:new URL('verify-email.html',location.href).href}),
});
export const verificationEmailState=uid=>verificationDelivery.state(uid);
export const verificationEmailWait=uid=>verificationDelivery.remaining(uid);
function unavailable(code) { const error=new Error(code);error.code=code;throw error; }
function requireConfigured() {
  if(!AUTH_SETTINGS.enabled)unavailable('auth/not-configured');
  if(configurationIssues.length)unavailable('config/incomplete');
}
export function signInEmail(email,password) {
  requireConfigured();return signInWithEmailAndPassword(auth,email.trim(),password);
}
export function signInProvider(id) {
  requireConfigured();
  if(!AUTH_SETTINGS.providers[id])unavailable('auth/provider-not-configured');
  const provider=id==='google'?new GoogleAuthProvider():id==='github'?new GithubAuthProvider():null;
  if(!provider)unavailable('auth/provider-not-configured');
  if(id==='google')provider.setCustomParameters({prompt:'select_account'});
  // Called directly from the click gesture, with no await before the popup.
  // No repository, profile-management or other unrelated OAuth scopes are added.
  return signInWithPopup(auth,provider);
}
export async function registerEmail(values) {
  requireConfigured();if(!AUTH_SETTINGS.registration)unavailable('auth/signup-disabled');
  const errors=validateRegistration(values);if(errors.length)throw new Error(errors.join(' '));
  const {user}=await createUserWithEmailAndPassword(auth,values.email.trim(),values.password);
  // Account creation does not grant institution roles or data permissions.
  await updateProfile(user,{displayName:values.name.trim()});
  return user;
}
export function requestPasswordReset(email) {
  requireConfigured();return sendPasswordResetEmail(auth,email.trim(),{url:new URL('login.html',location.href).href});
}
export async function requestEmailVerification() {
  requireConfigured();await auth.authStateReady();if(!auth.currentUser)unavailable('auth/session-required');
  return verificationDelivery.request(auth.currentUser);
}
export async function refreshVerifiedUser() {
  requireConfigured();await auth.authStateReady();if(!auth.currentUser)unavailable('auth/session-required');
  await reload(auth.currentUser);await auth.currentUser.getIdToken(true);return auth.currentUser;
}
export function inspectPasswordReset(code) {requireConfigured();return verifyPasswordResetCode(auth,code);}
export function completePasswordReset(code,password) {requireConfigured();return confirmPasswordReset(auth,code,password);}
export function inspectEmailAction(code) {requireConfigured();return checkActionCode(auth,code);}
export function completeEmailVerification(code) {requireConfigured();return applyActionCode(auth,code);}
export function endAuthSession() {return signOut(auth);}
