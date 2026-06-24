import { animate, stagger } from 'animejs';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';

const NAV_ITEMS = [
  { href: 'index.html',        label: 'Overview',     icon: iconGrid()    },
  { href: 'alerts.html',       label: 'Alerts',       icon: iconBell()    },
  { href: 'transactions.html', label: 'Transactions', icon: iconList()    },
  { href: 'graph.html',        label: 'Graph',        icon: iconShare()   },
  { href: 'reports.html',      label: 'Reports',      icon: iconFile()    },
];

function iconGrid()   { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>`; }
function iconBell()   { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`; }
function iconList()   { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
function iconShare()  { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>`; }
function iconFile()   { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`; }
function iconSignOut(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`; }

export function renderLayout({ active, pageTitle, pageSubtitle }) {
  const root   = document.getElementById('app');
  const navHtml = NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="nav-link ${item.href === active ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');

  root.innerHTML = `
    <div class="min-h-screen flex">
      <!-- Sidebar -->
      <aside id="sidebar" class="w-64 shrink-0 flex flex-col p-5 fixed h-screen z-20 -translate-x-full lg:translate-x-0 transition-transform" style="background:rgba(7,8,16,0.92);backdrop-filter:blur(24px);border-right:1px solid rgba(201,168,76,0.15);">
        <div class="flex items-center gap-3 px-2 mb-8">
          <div class="logo-glow w-10 h-10 rounded-xl flex items-center justify-center relative" style="background:linear-gradient(135deg,#c9a84c 0%,#e8c96e 50%,#c9a84c 100%);box-shadow:0 0 20px -4px rgba(201,168,76,0.5),inset 0 1px 0 rgba(255,255,255,0.3);">
            <span class="font-bold text-sm" style="color:#07080f;letter-spacing:0.05em;">A</span>
          </div>
          <div>
            <div class="font-bold tracking-tight text-metallic-gold">Acurion</div>
            <div class="text-xs mt-0.5" style="color:var(--color-silver);opacity:0.7;">AML Intelligence</div>
          </div>
        </div>
        <nav class="flex flex-col gap-1">
          ${navHtml}
        </nav>
        <div class="mt-auto pt-6 border-t border-border">
          <div class="flex items-center gap-3 px-2 py-2 mb-2">
            <div id="user-avatar" class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.30);color:var(--color-accent-light);">--</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm truncate" id="user-display">Loading…</div>
              <div class="text-xs text-text-faint truncate" id="user-email"></div>
            </div>
          </div>
          <button
            id="signout-btn"
            class="nav-link w-full text-left text-text-faint hover:text-text gap-2 mt-1"
            style="opacity:0.7"
          >
            ${iconSignOut()}
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <!-- Mobile overlay -->
      <div id="overlay" class="fixed inset-0 bg-black/60 z-10 hidden lg:hidden"></div>

      <!-- Main content area -->
      <div class="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header class="sticky top-0 z-10 backdrop-blur-xl" style="background:rgba(7,8,16,0.88);border-bottom:1px solid rgba(201,168,76,0.12);">
          <div class="flex items-center justify-between px-6 py-4">
            <div class="flex items-center gap-3">
              <button id="menuBtn" class="lg:hidden btn-ghost !px-2.5 !py-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              <div>
                <h1 class="text-lg font-semibold tracking-tight">${pageTitle}</h1>
                ${pageSubtitle ? `<p class="text-sm text-text-faint mt-0.5">${pageSubtitle}</p>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style="background:rgba(29,233,182,0.06);border:1px solid rgba(29,233,182,0.25);color:var(--color-teal);">
                <span class="pulse-dot"></span>
                <span>Live monitoring</span>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" class="flex-1 p-6">
          <!-- page content injected here -->
        </main>
      </div>
    </div>
  `;

  // ── Auth guard ────────────────────────────────────────────────────────────
  // onAuthStateChanged resolves from cache instantly on subsequent page loads.
  // If no user is found, redirect to login before any data fetch happens.
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('login.html');
      return;
    }

    // Populate sidebar user info with real account details
    const email    = user.email || '';
    const name     = user.displayName || email.split('@')[0] || 'Analyst';
    const initials = name.slice(0, 2).toUpperCase();

    const avatarEl  = document.getElementById('user-avatar');
    const displayEl = document.getElementById('user-display');
    const emailEl   = document.getElementById('user-email');

    if (avatarEl)  avatarEl.textContent  = initials;
    if (displayEl) displayEl.textContent = name;
    if (emailEl)   emailEl.textContent   = email;
  });

  // ── Sign-out ──────────────────────────────────────────────────────────────
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } finally {
      window.location.href = 'login.html';
    }
  });

  // ── Mobile menu toggle ────────────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  });

  // ── Entrance animation for nav links ─────────────────────────────────────
  animate('.nav-link', {
    opacity: [0, 1],
    translateX: [-12, 0],
    delay: stagger(60),
    duration: 500,
    ease: 'outQuad',
  });

  return document.getElementById('main-content');
}
