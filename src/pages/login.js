import '../styles/main.css';
import { installTooltips } from '../components/tooltip.js';
import { navigateSmoothly,installMotion } from '../lib/motion.js';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { icon,escapeHTML as esc } from '../components/icons.js';
import { mountGatewayFlow } from '../islands/ambient.tsx';
import { DEMO_MODE } from '../lib/config.js';
import { AUTH_PROVIDERS,authErrorMessage,validateRegistration,safeReturnPath,requiresEmailVerification } from '../lib/authPolicy.js';
import { AUTH_SETTINGS,signInEmail,signInProvider,registerEmail,requestPasswordReset,requestEmailVerification,verificationEmailState,verificationEmailWait,refreshVerifiedUser,inspectPasswordReset,completePasswordReset,inspectEmailAction,completeEmailVerification,endAuthSession } from '../lib/authService.js';
installMotion();
installTooltips();
const page=location.pathname.split('/').pop();
const mode=({'signup.html':'signup','forgot-password.html':'forgot','verify-email.html':'verify','auth-action.html':'action'})[page]||'login';
const params=new URLSearchParams(location.search),returnPath=safeReturnPath(params.get('next'),location.origin);
let busy=false,localOperation=false;
const labels={login:['Welcome back','Sign in to your Acurion workspace.'],signup:['Create your account','Get started with your work email.'],forgot:['Reset your password','We’ll send a link to help you regain access.'],verify:['Verify your email','You cannot access workspace records until your email is verified.'],action:['Secure account action','Checking the link from your email…']};
const providerIcons={
  google:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.5h3.23c1.89-1.74 2.99-4.31 2.99-7.34Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.91a6 6 0 0 1 0-3.82V7.5H3.05a10 10 0 0 0 0 9l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.34 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></svg>',
  github:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.12.68-3.78-1.32-3.78-1.32-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.49-.28-5.11-1.25-5.11-5.54 0-1.22.44-2.22 1.16-3-.11-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.6 10.6 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.22 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.3-2.63 5.26-5.13 5.54.4.35.76 1.03.76 2.08v3.09c0 .3.2.64.77.53A11.2 11.2 0 0 0 12 .8Z"/></svg>',
};
const passwordField=(label,name,autocomplete)=>`<div class="field"><label for="${name}">${label}</label><span class="auth-password"><input class="input" type="password" id="${name}" name="${name}" autocomplete="${autocomplete}" required ${mode==='signup'?'minlength="12" maxlength="128"':''}><button type="button" class="password-toggle icon-button" data-password="${name}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false" data-tooltip="Show or hide this password on your screen. Your password is never included in diagnostic details.">${icon('eye',16)}</button></span></div>`;
const providerButtons=()=>`<div class="auth-providers">${AUTH_PROVIDERS.map(provider=>`<button type="button" class="auth-provider" data-provider="${provider.id}" aria-label="Continue with ${provider.label}" data-tooltip="${AUTH_SETTINGS.providers[provider.id]?`Sign in securely using your ${provider.label} account. Workspace data access still requires approval.`:`${provider.label} sign-in has not been enabled for this website. Use email sign-in or ask your administrator to enable this provider.`}">${providerIcons[provider.id]}<span>Continue with ${provider.label}</span></button>`).join('')}</div><div class="auth-divider"><span>or continue with email</span></div>`;
const loginForm=()=>`${providerButtons()}<form id="auth-form"><label class="field" for="email">Work email<input type="email" id="email" name="email" class="input" autocomplete="email" placeholder="you@institution.com" required></label>${passwordField('Password','password','current-password')}<a class="auth-forgot text-button" href="forgot-password.html">Forgot password?</a><button class="btn-primary auth-submit" type="submit">Sign in</button></form><p class="auth-switch">New to Acurion? <a href="signup.html" class="text-button">Create an account</a></p>`;
const signupForm=()=>`${providerButtons()}<form id="auth-form"><label class="field" for="name">Full name<input class="input" id="name" name="name" autocomplete="name" required maxlength="100" placeholder="Your name"></label><label class="field" for="email">Work email<input type="email" class="input" id="email" name="email" autocomplete="email" required placeholder="you@institution.com"></label>${passwordField('Password','password','new-password')}${passwordField('Confirm password','confirmation','new-password')}<p class="auth-hint">Use at least 12 characters. After verifying your email, ask your administrator to approve your Account ID for workspace data access.</p><button class="btn-primary auth-submit" type="submit">Create account</button></form><p class="auth-switch">Already have an account? <a href="login.html" class="text-button">Sign in</a></p>`;
const forgotForm=()=>`<form id="auth-form"><label class="field" for="email">Work email<input type="email" class="input" id="email" name="email" autocomplete="email" placeholder="you@institution.com" required></label><button class="btn-primary auth-submit" type="submit">Send reset link</button></form><p class="auth-switch"><a class="text-button" href="login.html">Back to sign in</a></p>`;
const verifyForm=()=>`<div class="auth-verification-icon">${icon('mail',26)}</div><p class="auth-hint" id="verify-description">Checking your signed-in account…</p><p class="auth-hint" id="verification-delivery-status" role="status" aria-live="polite"></p><details class="auth-hint" id="verification-delivery-details" hidden><summary>Delivery details</summary><p id="verification-error-code"></p></details><div class="auth-verification-actions"><button class="btn-primary" id="check-verification" data-tooltip="Open the link in your verification email first. This button refreshes your account and checks whether verification is complete." disabled>I’ve verified my email</button><button class="btn-ghost" id="resend-verification" data-tooltip="Requests one verification email. Check spam and junk folders. Repeated requests may trigger a Firebase rate limit; wait for the timer before retrying." disabled>Send verification email</button><button class="text-button" id="change-account">Use a different account</button></div>`;
const app=document.getElementById('app');
app.innerHTML=`<div class="auth-page"><div class="auth-flow" id="login-flow" aria-hidden="true"></div><header class="auth-header"><a href="login.html" class="auth-brand"><span>${icon('shield',22)}</span><strong>ACURION</strong></a><a class="text-button" href="system.html">Workspace status ${icon('chevrons',12)}</a></header><div class="auth-layout"><section class="auth-intro"><span class="section-kicker">FINANCIAL INTELLIGENCE</span><h2>Clarity for every investigation.</h2><p>Follow the activity. Review the evidence. Keep every decision connected.</p><div class="auth-intro-steps">${[['01','Understand the customer','Profiles, due diligence and screening.'],['02','Follow the evidence','Transactions, account paths and risk signals.'],['03','Record the decision','Analyst reviews, case notes and report drafts.']].map(([number,title,detail])=>`<div><span>${number}</span><p><strong>${title}</strong><small>${detail}</small></p></div>`).join('')}</div></section><main class="auth-card" id="auth-card"><span class="auth-card-kicker">YOUR WORKSPACE</span><h1>${labels[mode][0]}</h1><p class="auth-description">${labels[mode][1]}</p><div class="auth-feedback" id="auth-feedback" role="status" aria-live="polite" hidden></div><div id="auth-content">${({login:loginForm,signup:signupForm,forgot:forgotForm,verify:verifyForm,action:()=>'<div class="data-empty" role="status">Checking email link…</div>'})[mode]()}</div>${['login','signup'].includes(mode)?`<div class="auth-demo"><button type="button" class="text-button" id="open-demo">Explore demo workspace →</button><span>Fictional records. No bank connection.</span></div>`:''}</main></div><footer class="auth-footer"><span>Acurion / Analyst workspace</span><span>Customer context. Connected evidence.</span></footer></div>`;
mountGatewayFlow(document.getElementById('login-flow'));

function feedback(message,{error=false}={}) {
  const box=document.getElementById('auth-feedback');box.hidden=false;box.textContent=message;box.classList.toggle('auth-feedback-error',error);box.setAttribute('role',error?'alert':'status');
}
function setBusy(value,button,label) {
  busy=value;document.getElementById('auth-card').setAttribute('aria-busy',String(value));
  document.querySelectorAll('#auth-card button').forEach(control=>{control.disabled=value;});
  if(button){if(value){button.dataset.idleLabel=button.innerHTML;button.innerHTML=`<span class="auth-spinner" aria-hidden="true"></span>${esc(label||'Please wait…')}`;}else if(button.dataset.idleLabel){button.innerHTML=button.dataset.idleLabel;delete button.dataset.idleLabel;}}
  if(mode==='verify')updateVerificationControls();
}
function reportError(error) {
  const message=mode==='verify' && error.code==='auth/too-many-requests'
    ? 'Firebase rejected this verification email request because of a rate limit. Delivery of earlier emails is unconfirmed. Wait before trying again; Firebase may require a longer wait.'
    : error.validation===true?error.message:authErrorMessage(error);
  feedback(message,{error:true});
}
function updateVerificationControls() {
  const user=auth.currentUser,wait=verificationEmailWait(user?.uid),state=verificationEmailState(user?.uid);
  const resend=document.getElementById('resend-verification'),check=document.getElementById('check-verification');
  resend.disabled=busy||!user?.email||user.emailVerified||wait>0;
  check.disabled=busy||!user;
  if(!busy){resend.textContent=wait>0?`Try again in ${wait}s`:state?'Resend verification email':'Send verification email';check.textContent=user?.emailVerified?'Continue to workspace':'I’ve verified my email';}
  document.getElementById('change-account').textContent=user?'Use a different account':'Sign in to verify email';
  const status=document.getElementById('verification-delivery-status');
  const delivery=state?.status||params.get('delivery');
  const message=!user?'':user.emailVerified?'Your email is verified. Continue to your workspace. Record access also requires approval from your administrator.':({
    sent:'Firebase accepted the verification email request. Inbox delivery is unconfirmed. Finish verification from the email, then return here to continue.',
    sending:'A verification request was made recently. Its delivery is unconfirmed. Wait before making another request.',
    'rate-limited':'Firebase rejected the last verification request because of rate limits. Delivery of earlier emails is unconfirmed. The retry timer is an app precaution; Firebase’s limit may last longer.',
    failed:`The verification email request failed. ${state?.errorCode?authErrorMessage(state.errorCode):'Wait before trying again.'} You do not need to register again.`,
  })[delivery]||'Request a verification email when you are ready. No email is sent just by opening this page.';
  if(status.textContent!==message)status.textContent=message;
  const details=document.getElementById('verification-delivery-details'),code=document.getElementById('verification-error-code');
  details.hidden=!user||user.emailVerified||!state?.errorCode;
  const detail=details.hidden?'':`Firebase error: ${state.errorCode}. Share this code with your workspace administrator.`;
  if(code.textContent!==detail)code.textContent=detail;
}
function enterWorkspace(user) {
  try{sessionStorage.removeItem('acurion:demo');}catch{}
  navigateSmoothly(requiresEmailVerification(user)?'verify-email.html':returnPath,{replace:true});
}
async function perform(button,label,action) {
  if(busy)return;setBusy(true,button,label);document.getElementById('auth-feedback').hidden=true;
  try{await action();}catch(error){reportError(error);}finally{setBusy(false,button);}
}
function bindPasswords() {
  document.querySelectorAll('[data-password]').forEach(button=>button.onclick=()=>{const input=document.getElementById(button.dataset.password),shown=input.type==='text';input.type=shown?'password':'text';button.setAttribute('aria-pressed',String(!shown));button.setAttribute('aria-label',`${shown?'Show':'Hide'} ${button.dataset.password==='confirmation'?'confirm password':'password'}`);button.innerHTML=icon(shown?'eye':'eyeOff',16);});
}
bindPasswords();
document.getElementById('open-demo')?.addEventListener('click',()=>{try{sessionStorage.setItem('acurion:demo','true');navigateSmoothly('index.html');}catch{feedback('Browser session storage is unavailable. Enable storage to open the demo.',{error:true});}});
document.querySelectorAll('[data-provider]').forEach(button=>button.onclick=()=>perform(button,`Connecting to ${AUTH_PROVIDERS.find(provider=>provider.id===button.dataset.provider).label}…`,async()=>{
  localOperation=true;
  try{const result=await signInProvider(button.dataset.provider);enterWorkspace(result.user);}finally{localOperation=false;}
}));
document.getElementById('auth-form')?.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,values=Object.fromEntries(new FormData(form)),button=form.querySelector('.auth-submit');
  perform(button,mode==='forgot'?'Sending link…':mode==='signup'?'Creating account…':'Signing in…',async()=>{
    localOperation=true;
    try{
      if(mode==='forgot'){
        try{await requestPasswordReset(values.email);}catch(error){if(error.code!=='auth/user-not-found')throw error;}
        // This wording does not disclose whether the email belongs to an account.
        feedback('If an account uses this email, a reset link has been sent. Check your inbox and spam folder.');
      }else if(mode==='signup'){
        const errors=validateRegistration(values);if(errors.length)throw Object.assign(new Error(errors.join(' ')),{validation:true});
        await registerEmail(values);
        let delivery;
        try{await requestEmailVerification();delivery='sent';}catch(error){delivery=error.code==='auth/too-many-requests'?'rate-limited':'failed';}
        navigateSmoothly(`verify-email.html?delivery=${delivery}`,{replace:true});
      }else{const result=await signInEmail(values.email,values.password);enterWorkspace(result.user);}
    }finally{localOperation=false;}
  });
});

if(mode==='verify'){
  document.getElementById('resend-verification').onclick=event=>perform(event.currentTarget,'Sending email…',async()=>{await requestEmailVerification();feedback('Firebase accepted the verification email request. Check your inbox and spam folder.');});
  document.getElementById('check-verification').onclick=event=>perform(event.currentTarget,'Checking…',async()=>{const user=await refreshVerifiedUser();if(user.emailVerified)enterWorkspace(user);else feedback('You cannot continue because your email is not verified yet. Open the verification link in your inbox or spam folder, then click “I’ve verified my email” again.',{error:true});});
  document.getElementById('change-account').onclick=async()=>{if(busy)return;try{await endAuthSession();navigateSmoothly('login.html',{replace:true});}catch(error){reportError(error);}};
  let verificationTimer;
  const startVerificationTimer=()=>{if(verificationTimer==null)verificationTimer=setInterval(updateVerificationControls,1000);};
  startVerificationTimer();
  window.addEventListener('pagehide',()=>{clearInterval(verificationTimer);verificationTimer=null;});
  window.addEventListener('pageshow',event=>{if(event.persisted){updateVerificationControls();startVerificationTimer();}});
}
onAuthStateChanged(auth,user=>{
  if(localOperation)return;
  if(user&&['login','signup'].includes(mode)&&AUTH_SETTINGS.enabled&&params.get('reauth')!=='1')enterWorkspace(user);
  if(mode==='verify'){
    if(user){document.getElementById('verify-description').textContent=user.email?`Check the inbox for ${user.email}. Open the verification link, then return here.`:authErrorMessage({code:'auth/missing-email'});if(user.emailVerified)feedback('Your email is verified. Continue to your workspace. Record access also requires approval from your administrator.');}
    else{document.getElementById('verify-description').textContent='Sign in first to send or check your verification email.';}
    updateVerificationControls();
  }
});
if(DEMO_MODE&&mode==='login')navigateSmoothly('index.html',{replace:true});
if(mode==='login'&&params.get('reauth')==='1')feedback('Your session needs to be renewed. Enter your credentials or choose your original sign-in provider to sign in again.');

async function handleEmailAction(){
  const content=document.getElementById('auth-content'),code=params.get('oobCode'),action=params.get('mode');
  const retryLink=action==='resetPassword'?'forgot-password.html':'verify-email.html';
  if(!code||!['resetPassword','verifyEmail'].includes(action)){
    feedback('This account link is missing required information. Open the complete link from your email.',{error:true});content.innerHTML='<a class="btn-ghost" href="login.html">Back to sign in</a>';return;
  }
  try{
    if(action==='resetPassword'){
      await inspectPasswordReset(code);
      document.querySelector('#auth-card h1').textContent='Choose a new password';document.querySelector('.auth-description').textContent='Enter your new password to finish resetting your account.';
      content.innerHTML=`<form id="reset-form">${passwordField('New password','password','new-password')}${passwordField('Confirm password','confirmation','new-password')}<p class="auth-hint">Use at least 12 characters.</p><button class="btn-primary auth-submit">Update password</button></form>`;
      bindPasswords();content.querySelectorAll('input').forEach(input=>{input.minLength=12;input.maxLength=128;});
      document.getElementById('reset-form').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));perform(event.target.querySelector('button[type="submit"], .auth-submit'),'Updating password…',async()=>{if(values.password.length<12||values.password!==values.confirmation)throw Object.assign(new Error('Use at least 12 characters and make sure both passwords match.'),{validation:true});await completePasswordReset(code,values.password);content.innerHTML='<a class="btn-primary" href="login.html">Return to sign in</a>';feedback('Password updated. Sign in with your new password.');});};
    }else{
      const info=await inspectEmailAction(code);if(info.operation!=='VERIFY_EMAIL')throw Object.assign(new Error('Invalid action'),{code:'auth/invalid-action-code'});
      document.querySelector('#auth-card h1').textContent='Confirm your email';document.querySelector('.auth-description').textContent='Complete email verification for your Acurion account.';
      content.innerHTML='<button class="btn-primary auth-submit" id="confirm-email">Verify email</button>';
      document.getElementById('confirm-email').onclick=event=>perform(event.currentTarget,'Verifying…',async()=>{await completeEmailVerification(code);content.innerHTML='<a class="btn-primary" href="verify-email.html">Continue to your account</a>';feedback('Email verified successfully.');});
    }
  }catch(error){reportError(error);content.innerHTML=`<a class="btn-ghost" href="${retryLink}">Request a new email link</a>`;}
}
if(mode==='action')handleEmailAction();
