import { animate, stagger } from 'animejs';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';

const NAV_ITEMS = [
  { href: 'index.html',        label: 'Overview',     icon: iconGrid()   },
  { href: 'alerts.html',       label: 'Alerts',       icon: iconBell()   },
  { href: 'transactions.html', label: 'Transactions', icon: iconList()   },
  { href: 'graph.html',        label: 'Graph',        icon: iconShare()  },
  { href: 'reports.html',      label: 'Reports',      icon: iconFile()   },
];

function iconGrid()    { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>`; }
function iconBell()    { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`; }
function iconList()    { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
function iconShare()   { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>`; }
function iconFile()    { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`; }
function iconSignOut() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`; }

export function renderLayout({ active, pageTitle, pageSubtitle }) {
  const root    = document.getElementById('app');
  const navHtml = NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="nav-link ${item.href === active ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');

  root.innerHTML = `
    <div style="display:flex;min-height:100vh;">

      <!-- Sidebar -->
      <aside id="sidebar" style="
        width: 220px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        position: fixed;
        height: 100vh;
        z-index: 20;
        background: var(--color-surface);
        border-right: 1px solid var(--color-border);
        transform: translateX(-100%);
        transition: transform 0.25s ease;
      " class="lg-sidebar-visible">

        <!-- Logo -->
        <div style="display:flex;align-items:center;gap:10px;padding:4px 6px;margin-bottom:28px;">
          <div style="
            width:32px; height:32px; border-radius:8px;
            background:var(--color-accent);
            display:flex;align-items:center;justify-content:center;
            flex-shrink:0;
          ">
            <span style="font-weight:700;font-size:14px;color:#111010;letter-spacing:-0.02em;">A</span>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px;color:var(--color-text);letter-spacing:-0.02em;">Acurion</div>
            <div style="font-size:11px;color:var(--color-text-faint);margin-top:1px;">AML Intelligence</div>
          </div>
        </div>

        <!-- Nav -->
        <nav style="display:flex;flex-direction:column;gap:2px;">
          ${navHtml}
        </nav>

        <!-- User section -->
        <div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--color-border);">
          <div style="display:flex;align-items:center;gap:10px;padding:6px;margin-bottom:4px;">
            <div id="user-avatar" style="
              width:30px;height:30px;border-radius:99px;
              background:var(--color-accent-muted);
              border:1px solid rgba(212,240,64,0.2);
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:600;
              color:var(--color-accent);
              flex-shrink:0;
            ">--</div>
            <div style="min-width:0;flex:1;">
              <div style="font-size:13px;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="user-display">Loading…</div>
              <div style="font-size:11px;color:var(--color-text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="user-email"></div>
            </div>
          </div>
          <button id="signout-btn" class="nav-link" style="width:100%;background:none;border:1px solid transparent;cursor:pointer;text-align:left;">
            ${iconSignOut()}
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <!-- Mobile overlay -->
      <div id="overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10;"></div>

      <!-- Main -->
      <div style="flex:1;display:flex;flex-direction:column;min-height:100vh;" class="lg-main-offset">
        <header style="
          position:sticky;top:0;z-index:10;
          background:rgba(17,16,16,0.9);
          border-bottom:1px solid var(--color-border);
          backdrop-filter:blur(12px);
        ">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 24px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <button id="menuBtn" class="btn-ghost lg-hidden" style="padding:6px 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              <div>
                <h1 style="font-size:15px;font-weight:600;color:var(--color-text);letter-spacing:-0.01em;">${pageTitle}</h1>
                ${pageSubtitle ? `<p style="font-size:12px;color:var(--color-text-faint);margin-top:1px;">${pageSubtitle}</p>` : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="sm-only" style="
                display:flex;align-items:center;gap:7px;
                padding:5px 11px;border-radius:99px;
                background:rgba(212,240,64,0.06);
                border:1px solid rgba(212,240,64,0.15);
                font-size:12px;color:var(--color-accent);
              ">
                <span class="pulse-dot"></span>
                <span>Live</span>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" style="flex:1;padding:24px;">
          <!-- page content injected here -->
        </main>
      </div>
    </div>

    <style>
      @media (min-width: 1024px) {
        .lg-sidebar-visible { transform: translateX(0) !important; }
        .lg-main-offset { margin-left: 220px; }
        .lg-hidden { display: none !important; }
      }
      @media (max-width: 639px) { .sm-only { display: none !important; } }
    </style>
  `;

  // ── Auth guard ──────────────────────────────────────────────
  onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.replace('login.html'); return; }

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

  // ── Sign-out ─────────────────────────────────────────────────
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    try { await signOut(auth); } finally { window.location.href = 'login.html'; }
  });

  // ── Mobile menu ───────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    sidebar.style.transform = sidebar.style.transform === 'translateX(0px)' ? '' : 'translateX(0px)';
    overlay.style.display = overlay.style.display === 'block' ? 'none' : 'block';
  });
  overlay?.addEventListener('click', () => {
    sidebar.style.transform = '';
    overlay.style.display = 'none';
  });

  // ── Nav animation ─────────────────────────────────────────────
  animate('.nav-link', {
    opacity: [0, 1],
    translateX: [-8, 0],
    delay: stagger(50),
    duration: 400,
    ease: 'outQuad',
  });

  return document.getElementById('main-content');
}
