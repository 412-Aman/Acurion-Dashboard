import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { icon } from '../components/icons.js';
import { mountGatewayFlow } from '../islands/ambient.tsx';
import { DEMO_MODE } from '../lib/config.js';
if (DEMO_MODE) window.location.replace('index.html');

// If a session already exists, skip the login screen immediately
onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace('index.html');
});

const app = document.getElementById('app');

app.innerHTML = `
  <div class="login-page"><div class="login-flow" id="login-flow" aria-hidden="true"></div><div class="login-grid" aria-hidden="true"></div><div class="login-chips" aria-hidden="true">${['Review customer KYC','Screen counterparties','Investigate unusual transfers','Review risk changes','Prepare STR draft','Maintain evidence records'].map((label,i) => `<div class="login-chip" style="left:${[8,68,15,75,5,65][i]}%;top:${[20,18,62,65,80,85][i]}%;animation-delay:-${i*3}s">${label}</div>`).join('')}</div>
    <main class="login-card" id="form-card"><div class="login-icon">${icon('shield',20)}</div><h1>Acurion</h1><p>Sign in with your institution account to continue.</p><div id="error-msg" class="login-error" role="alert" style="display:none"></div><form id="login-form"><label class="field" for="email">Work email<input type="email" id="email" class="input" placeholder="analyst@institution.com" autocomplete="email" required></label><label class="field" for="password">Password<input type="password" id="password" class="input" placeholder="Enter your password" autocomplete="current-password" required></label><button type="submit" id="submit-btn" class="btn-primary">Continue to workspace</button></form><p class="login-footnote">Customer due diligence · Monitoring · Investigations</p></main>
  </div>`;


mountGatewayFlow(document.getElementById('login-flow'));

// ── Auth error messages ──────────────────────────────────────────────────────
const AUTH_ERRORS = {
  'auth/user-not-found':     'No account found with this email address.',
  'auth/wrong-password':     'Incorrect password. Please try again.',
  'auth/invalid-email':      'Please enter a valid email address.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests':  'Too many failed attempts. Please wait and try again.',
  'auth/network-request-failed': 'Network error - check your connection.',
};

const form      = document.getElementById('login-form');
const errorEl   = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  animate(errorEl, { opacity: [0, 1], translateY: [-4, 0], duration: 300, ease: 'outQuad' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.style.display = 'none';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  submitBtn.textContent = 'Signing in…';
  submitBtn.disabled    = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will fire and redirect automatically,
    // but we also redirect here for speed
    window.location.href = 'index.html';
  } catch (err) {
    const msg = AUTH_ERRORS[err.code] || `Sign-in failed (${err.code})`;
    showError(msg);
    submitBtn.textContent = 'Continue to workspace';
    submitBtn.disabled    = false;
  }
});
