import '../styles/main.css';
import { animate, stagger } from 'animejs';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';

// If a session already exists, skip the login screen immediately
onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace('index.html');
});

const app = document.getElementById('app');

app.innerHTML = `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--color-bg);">
    <div style="width:100%;max-width:360px;">

      <div id="logo-block" style="display:flex;flex-direction:column;align-items:center;margin-bottom:28px;opacity:0;">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--color-accent);display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <span style="font-weight:700;font-size:15px;color:#111010;">A</span>
        </div>
        <div style="font-weight:600;font-size:16px;letter-spacing:-0.02em;color:var(--color-text);">Acurion</div>
        <div style="font-size:12px;color:var(--color-text-faint);margin-top:2px;">AML Intelligence Platform</div>
      </div>

      <div id="form-card" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:14px;padding:24px;opacity:0;">
        <h1 style="font-size:15px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Sign in</h1>
        <p style="font-size:13px;color:var(--color-text-faint);margin-bottom:20px;">Access the compliance dashboard</p>

        <div id="error-msg" style="display:none;margin-bottom:14px;padding:10px 12px;border-radius:8px;background:rgba(201,64,96,0.08);border:1px solid rgba(201,64,96,0.25);font-size:12px;color:#c94060;"></div>

        <form id="login-form" style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;font-size:12px;color:var(--color-text-faint);margin-bottom:6px;" for="email">Email</label>
            <input type="email" id="email" class="input" style="width:100%;" placeholder="admin@acurion.ai" autocomplete="email" required />
          </div>
          <div>
            <label style="display:block;font-size:12px;color:var(--color-text-faint);margin-bottom:6px;" for="password">Password</label>
            <input type="password" id="password" class="input" style="width:100%;" placeholder="••••••••" autocomplete="current-password" required />
          </div>
          <button type="submit" id="submit-btn" class="btn-primary" style="width:100%;margin-top:4px;">Sign in</button>
        </form>
      </div>

    </div>
  </div>
`;

// Entrance animation
animate(['#logo-block', '#form-card'], {
  opacity: [0, 1],
  translateY: [16, 0],
  delay: stagger(150),
  duration: 600,
  ease: 'outQuad',
});

// ── Auth error messages ──────────────────────────────────────────────────────
const AUTH_ERRORS = {
  'auth/user-not-found':     'No account found with this email address.',
  'auth/wrong-password':     'Incorrect password. Please try again.',
  'auth/invalid-email':      'Please enter a valid email address.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests':  'Too many failed attempts. Please wait and try again.',
  'auth/network-request-failed': 'Network error — check your connection.',
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
    submitBtn.textContent = 'Sign in';
    submitBtn.disabled    = false;
  }
});
