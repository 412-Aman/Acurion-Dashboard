import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { DEMO_MODE } from '../lib/config.js';
import { icon, escapeHTML as esc } from './icons.js';
import { installRecordMenu } from './recordMenu.js';
const NAV_ITEMS = [
  { href:'index.html', label:'Overview', icon:'overview', group:'home' },
  { href:'alerts.html', label:'Alert queue', icon:'alerts', group:'Monitoring' },
  { href:'transactions.html', label:'Transactions', icon:'transactions', group:'Monitoring' },
  { href:'graph.html', label:'Account network', icon:'graph', group:'Monitoring' },
  { href:'compliance.html?view=customers', label:'Customers & KYC', icon:'customers', group:'Compliance', view:'customers' },
  { href:'compliance.html?view=screening', label:'Screening', icon:'screening', group:'Compliance', view:'screening' },
  { href:'compliance.html?view=monitoring', label:'Monitoring rules', icon:'controls', group:'Compliance', view:'monitoring' },
  { href:'compliance.html?view=cases', label:'Investigations', icon:'cases', group:'Compliance', view:'cases' },
  { href:'reports.html', label:'Reports', icon:'reports', group:'Records' },
  { href:'reports.html#draft-tray', label:'Working drafts', icon:'reports', group:'Records' },
  { href:'compliance.html?view=controls', label:'Controls & audit', icon:'controls', group:'Records', view:'controls' },
];
export function renderLayout({ active, pageTitle, pageSubtitle }) {
  const root = document.getElementById('app');
  let activeView = new URLSearchParams(location.search).get('view') || 'customers';
  const sections = [
    { key:'home', label:'Workspace', icon:'overview', title:'The control room', description:'Your financial intelligence workspace.' },
    { key:'Monitoring', label:'Monitor', icon:'graph', title:'Follow the activity', description:'Transactions, alerts and account connections.' },
    { key:'Compliance', label:'Review', icon:'screening', title:'Know the customer', description:'Due diligence and investigative work.' },
    { key:'Records', label:'Records', icon:'reports', title:'Keep the evidence', description:'Reports, controls and working material.' },
  ];
  let currentSection = NAV_ITEMS.find(item => item.view ? active === 'compliance.html' && item.view === activeView : active === item.href)?.group || 'home';
  const descriptions = { 'Overview':'Signals at a glance', 'Alert queue':'Prioritise unusual activity', 'Transactions':'Inspect the transaction stream', 'Account network':'Trace connected accounts', 'Customers & KYC':'Profiles and due diligence', 'Screening':'Sanctions, PEPs and media', 'Monitoring rules':'Explainable risk scenarios', 'Investigations':'Cases and officer review', 'Reports':'Audit exports and summaries', 'Working drafts':'Temporary notes and recovery', 'Controls & audit':'Policies, retention and history' };
  const renderSection = (key) => {
    const section = sections.find(g => g.key === key) || sections[0];
    const items = key === 'home' ? NAV_ITEMS.filter(n => ['Overview','Alert queue','Customers & KYC','Reports'].includes(n.label)) : NAV_ITEMS.filter(n => n.group === key);
    return `<div class="navigation-caption"><span>${String(sections.indexOf(section)+1).padStart(2,'0')} / ${section.label.toUpperCase()}</span><h2>${section.title}</h2><p>${section.description}</p></div><div class="navigation-links">${items.map((item,i) => {
      const selected = item.view ? active === 'compliance.html' && item.view === activeView : item.href.includes('#') ? item.href === active + location.hash : active === item.href && !(active === 'reports.html' && location.hash === '#draft-tray');
      return `<a href="${item.href}" class="nav-link ${selected?'active':''}" ${selected?'aria-current="page"':''} ${item.view?`data-workspace-view="${item.view}"`:''}><span class="nav-line-icon">${icon(item.icon,18)}</span><span class="nav-line-copy"><strong>${item.label}</strong><small>${descriptions[item.label]}</small></span><span class="nav-line-arrow">↗</span></a>`;
    }).join('')}</div>`;
  };
  const pageIcon = NAV_ITEMS.find(item => item.href === active)?.icon || 'shield';
  root.innerHTML = `<div class="app-shell" id="app-shell">
    <aside class="app-sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-stack"><div class="navigation-rail"><a href="index.html" class="rail-brand" aria-label="Acurion overview"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true"><path d="m5 25 11-20 11 20M10 20h12M16 5v10" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="25" r="2" fill="currentColor"/></svg></a><div class="rail-sections">${sections.map(g=>`<button class="rail-button ${g.key===currentSection?'selected':''}" data-nav-group="${g.key}" title="${g.label}" aria-label="${g.label} navigation" aria-pressed="${g.key===currentSection}">${icon(g.icon,20)}<span>${g.label}</span></button>`).join('')}</div><div class="sidebar-footer rail-footer"><button class="account-trigger" id="account-trigger" aria-label="Workspace account" aria-expanded="false"><span class="user-avatar" id="user-avatar">—</span></button><div class="account-menu menu-surface" id="account-menu" hidden><div class="menu-label">Workspace account</div><a href="compliance.html?view=controls">${icon('controls')}Controls & audit</a><a href="reports.html">${icon('reports')}Reports & drafts</a><div class="menu-divider"></div><button id="signout-btn">${icon('logout')}Sign out</button></div></div></div>
      <section class="navigation-panel"><a class="navigation-wordmark" href="index.html"><strong>ACURION</strong><small>FINANCIAL INTELLIGENCE</small></a><nav class="sidebar-nav" id="context-navigation" aria-label="Workspace sections">${renderSection(currentSection)}</nav><div class="navigation-analyst"><span class="section-kicker">ANALYST WORKSPACE</span><strong id="user-display">Loading…</strong><small id="user-email"></small></div></section></div>
      <div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-label="Resize navigation" aria-orientation="vertical" aria-valuemin="264" aria-valuemax="420" tabindex="0"></div>
    </aside>
    <div class="sidebar-overlay" id="overlay" hidden></div>
    <div class="app-main"><header class="app-header"><button class="icon-button" id="menuBtn" aria-label="Toggle sidebar" title="Toggle sidebar">${icon('sidebar')}</button><div class="header-location"><span>${esc(pageTitle)}</span></div><div class="header-actions"><button class="search-trigger" id="global-search">${icon('search',14)}<span>Search</span><kbd>⌘K</kbd></button><button class="icon-button" id="notifications-btn" aria-label="Open alert notifications" title="Alert notifications">${icon('alerts')}</button><span class="workspace-mode">${icon('shield',12)}${DEMO_MODE ? 'Demo workspace' : 'Firebase workspace'}</span></div></header>
      <main id="main-content" class="main-content"><div class="view-heading"><div class="view-title">${icon(pageIcon,20)}<h1>${esc(pageTitle)}</h1></div><p>${esc(pageSubtitle || '')}</p></div><div id="page-content"></div></main>
    </div></div>
    <dialog id="search-dialog" class="command-dialog" aria-label="Search and commands"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close search">${icon('close')}</button></form><div class="command-input">${icon('search')}<input id="command-query" placeholder="Search customers, records and pages" aria-label="Search customers, records and pages" autocomplete="off"></div><div id="command-results" class="command-results"></div><div class="command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>enter</kbd> to open</span><span><kbd>esc</kbd> to close</span></div></dialog>
    <dialog id="notifications-dialog" class="panel-dialog" aria-label="Alert notifications"><div class="notification-chrome"><span>ACURION / ACTIVITY</span><form method="dialog"><button class="dialog-close icon-button" aria-label="Close notifications">${icon('close')}</button></form></div><div id="notification-list" class="notification-list"></div></dialog>`;
  const shell = document.getElementById('app-shell');
  const narrow = matchMedia('(max-width: 767px)');
  let isOpen = !narrow.matches;
  let width = 292;
  try { width = Math.max(264, Math.min(420, Number(localStorage.getItem('acurion:sidebar-width')) || 292)); isOpen = narrow.matches ? false : localStorage.getItem('acurion:sidebar-open') !== 'false'; } catch {}
  const setSidebar = () => { shell.style.setProperty('--sidebar-width', `${width}px`); shell.classList.toggle('sidebar-collapsed', !isOpen); shell.classList.toggle('sidebar-mobile-open', narrow.matches && isOpen); document.getElementById('sidebar').inert = narrow.matches && !isOpen; document.getElementById('sidebar').setAttribute('aria-hidden',String(narrow.matches && !isOpen)); document.getElementById('overlay').hidden = !(narrow.matches && isOpen); document.getElementById('menuBtn').setAttribute('aria-expanded', String(isOpen)); document.getElementById('sidebar-resizer').setAttribute('aria-valuenow', width); };
  setSidebar();
  document.querySelectorAll('[data-nav-group]').forEach(button => button.onclick = () => {
    currentSection = button.dataset.navGroup;
    document.getElementById('context-navigation').innerHTML = renderSection(currentSection);
    document.querySelectorAll('[data-nav-group]').forEach(b => { b.classList.toggle('selected',b === button); b.setAttribute('aria-pressed',String(b === button)); });
    if(!isOpen) { isOpen=true; setSidebar(); }
  });
  document.getElementById('menuBtn').onclick = () => { isOpen = !isOpen; setSidebar(); try { if (!narrow.matches) localStorage.setItem('acurion:sidebar-open', isOpen); } catch {} };
  document.getElementById('overlay').onclick = () => { isOpen = false; setSidebar(); };
  narrow.addEventListener('change', () => { isOpen = !narrow.matches; setSidebar(); });
  const resizer = document.getElementById('sidebar-resizer');
  const rememberWidth = () => { try { localStorage.setItem('acurion:sidebar-width', width); } catch {} };
  resizer.onpointerdown = event => { if (narrow.matches || !isOpen) return; resizer.setPointerCapture(event.pointerId); shell.classList.add('resizing'); const move = e => { width = Math.max(264, Math.min(420, Math.round(e.clientX))); setSidebar(); }; const end = () => { shell.classList.remove('resizing'); resizer.removeEventListener('pointermove', move); rememberWidth(); }; resizer.addEventListener('pointermove', move); resizer.addEventListener('pointerup', end, { once:true }); resizer.addEventListener('pointercancel', end, { once:true }); };
  resizer.onkeydown = event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); width = event.key === 'Home' ? 264 : event.key === 'End' ? 420 : Math.max(264,Math.min(420,width + (event.key === 'ArrowRight' ? 16 : -16))); setSidebar(); rememberWidth(); };
  document.addEventListener('acurion:workspace-view', event => {
    activeView=event.detail;
    currentSection=NAV_ITEMS.find(item=>item.view===activeView)?.group || 'Compliance';
    document.getElementById('context-navigation').innerHTML=renderSection(currentSection);
    document.querySelectorAll('[data-nav-group]').forEach(button=>{const selected=button.dataset.navGroup===currentSection;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  });
  window.addEventListener('hashchange',()=>{document.getElementById('context-navigation').innerHTML=renderSection(currentSection);});
  const accountMenu = document.getElementById('account-menu'); const accountTrigger = document.getElementById('account-trigger');
  accountTrigger.onclick = () => { accountMenu.hidden = !accountMenu.hidden; accountTrigger.setAttribute('aria-expanded', String(!accountMenu.hidden)); };
  document.addEventListener('click', e => { if (!e.target.closest('.sidebar-footer')) { accountMenu.hidden = true; accountTrigger.setAttribute('aria-expanded', 'false'); } });
  const setUser = (name, email) => { document.getElementById('user-display').textContent = name; document.getElementById('user-avatar').textContent = name.slice(0,2).toUpperCase(); document.getElementById('user-email').textContent = email; };
  if (DEMO_MODE) setUser('Demo analyst','Fictional data only');
  else onAuthStateChanged(auth, user => { if (!user) { location.replace('login.html'); return; } setUser(user.displayName || user.email?.split('@')[0] || 'Analyst', user.email || ''); });
  document.getElementById('signout-btn').onclick = async () => { await signOut(auth); location.href = 'login.html'; };
  const search = document.getElementById('search-dialog'); const input = document.getElementById('command-query'); const results = document.getElementById('command-results');
  let searchable = NAV_ITEMS.map(n => ({ ...n, detail:'Workspace page' }));
  const refreshSearchable = () => { searchable = NAV_ITEMS.map(n => ({ ...n, detail:'Workspace page' }));
  try { const stored = JSON.parse(localStorage.getItem('acurion.compliance.sandbox.v1') || '{}'); searchable.push(...(stored.customers || []).map(c => ({ label:c.name, detail:`Customer · ${c.id}`, icon:'customers', href:`compliance.html?view=customers&customer=${encodeURIComponent(c.id)}` }))); searchable.push(...(stored.cases || []).map(c => ({ label:c.id, detail:`Investigation · ${c.customerId}`, icon:'cases', href:`compliance.html?view=cases&case=${encodeURIComponent(c.id)}` }))); } catch {}
  };

  let currentResults = [], cursor = 0;
  const updateResults = () => { currentResults = searchable.filter(n => `${n.label} ${n.detail}`.toLowerCase().includes(input.value.toLowerCase())).slice(0,18); cursor = Math.min(cursor,Math.max(0,currentResults.length-1)); results.innerHTML = `<p class="menu-label">${input.value ? 'Matching records & pages' : 'Go to'}</p>${currentResults.map((n,i) => `<a href="${esc(n.href)}" class="command-result ${i === cursor ? 'selected' : ''}">${icon(n.icon)}<span>${esc(n.label)}<small>${esc(n.detail)}</small></span><span class="result-enter">↵</span></a>`).join('') || '<div class="empty">Nothing matches that search.</div>'}`; };
  const openSearch = () => { refreshSearchable(); updateResults(); search.showModal(); input.focus(); };
  document.getElementById('global-search').onclick = openSearch;
  input.oninput = () => { cursor = 0; updateResults(); };
  input.onkeydown = event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); cursor = Math.max(0,Math.min(currentResults.length-1,cursor + (event.key === 'ArrowDown' ? 1 : -1))); updateResults(); results.querySelector('.selected')?.scrollIntoView({ block:'nearest' }); } if (event.key === 'Enter' && currentResults[cursor]) { event.preventDefault(); location.href = currentResults[cursor].href; } };
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.open ? search.close() : openSearch(); } if (event.key === 'Escape') { if(narrow.matches && isOpen && !document.querySelector('dialog[open]')) {isOpen=false;setSidebar();document.getElementById('menuBtn').focus();} accountMenu.hidden = true; accountTrigger.setAttribute('aria-expanded','false'); } });
  let disposeNotifications;
  const notificationsDialog = document.getElementById('notifications-dialog');
  notificationsDialog.addEventListener('close',()=>{disposeNotifications?.();disposeNotifications=undefined;});
  document.getElementById('notifications-btn').onclick = async () => {
    notificationsDialog.showModal();
    const list=document.getElementById('notification-list');list.innerHTML='<div class="feed-loading">Loading alert activity…</div>';
    try { const {mountNotifications}=await import('../islands/notifications.tsx'); if(notificationsDialog.open){disposeNotifications?.();disposeNotifications=mountNotifications(list);} } catch { list.innerHTML='<p class="helper">The alert feed could not be loaded.</p>'; }
  };
  for (const dialog of root.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  installRecordMenu(document.getElementById('page-content'));
  return document.getElementById('page-content');
}
