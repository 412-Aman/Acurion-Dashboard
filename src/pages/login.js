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
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-sm">

      <div class="flex flex-col items-center mb-8 opacity-0" id="logo-block">
        <div class="w-12 h-12 rounded-xl bg-text flex items-center justify-center mb-3">
          <span class="text-bg font-bold text-lg">A</span>
        </div>
        <div class="font-semibold text-lg tracking-tight">Acurion</div>
        <div class="text-xs text-text-faint mt-0.5">AML Intelligence Platform</div>
      </div>

      <div class="glass-panel p-6 opacity-0" id="form-card">
        <h1 class="text-lg font-semibold mb-1">Sign in</h1>
        <p class="text-sm text-text-faint mb-6">Access the compliance dashboard</p>

        <div id="error-msg" class="hidden mb-4 px-3 py-2.5 rounded-lg bg-surface-2 text-xs border border-red-900/40 text-red-400"></div>

        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-xs text-text-faint mb-1.5" for="email">Email</label>
            <input
              type="email"
              id="email"
              class="input w-full"
              placeholder="admin@acurion.ai"
              autocomplete="email"
              required
            />
          </div>
          <div>
            <label class="block text-xs text-text-faint mb-1.5" for="password">Password</label>
            <input
              type="password"
              id="password"
              class="input w-full"
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
          </div>
          <button type="submit" id="submit-btn" class="btn-primary w-full">Sign in</button>
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
  errorEl.classList.remove('hidden');
  animate(errorEl, { opacity: [0, 1], translateY: [-4, 0], duration: 300, ease: 'outQuad' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');

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
