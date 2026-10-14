import { navigateSmoothly } from '../lib/motion.js';
import { authSettings,requiresEmailVerification } from '../lib/authPolicy.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { DEMO_MODE } from '../lib/config.js';
import { NAV_ITEMS, activeNavigation } from '../lib/navigation.js';
import { observeDataStatus } from '../lib/dataStatus.js';
import { icon, escapeHTML as esc } from './icons.js';
import { installRecordMenu } from './recordMenu.js';
export function renderLayout({active,pageTitle,pageSubtitle}) {
  const root=document.getElementById('app');
  let view=new URLSearchParams(location.search).get('view')||'customers';
  let destination=activeNavigation(active,view);
  const groups=['Workspace','Investigate','Due diligence','Manage'];
  const isSandbox=active==='compliance.html';
  const mode=isSandbox?'Browser sandbox':DEMO_MODE?'Demo records':'Firebase';
  const navigation=()=>groups.map((group,i)=>`<section class="nav-section"><div class="nav-group-heading"><span>${esc(group)}</span><small>${String(i+1).padStart(2,'0')}</small></div>${NAV_ITEMS.filter(n=>n.group===group).map(n=>`<a href="${n.href}" data-nav-href="${n.href}" class="nav-link ${n===destination?'active':''}" ${n===destination?'aria-current="page"':''} title="${esc(n.detail)}" ${n.view?`data-workspace-view="${n.view}"`:''}>${icon(n.icon,17)}<span>${esc(n.label)}</span><span class="nav-active-mark" aria-hidden="true" ${n===destination?'':'hidden'}>•</span></a>`).join('')}</section>`).join('');
  const railItems=NAV_ITEMS.filter(n=>['Overview','Alerts','Cases','Account network'].includes(n.label));
  root.innerHTML=`<div class="app-shell" id="app-shell"><aside class="app-sidebar" id="sidebar" aria-label="Main navigation"><div class="sidebar-stack">
    <div class="navigation-rail"><a href="index.html" class="rail-brand" aria-label="Acurion overview"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true"><path d="m5 25 11-20 11 20M10 20h12M16 5v10" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="25" r="2" fill="currentColor"/></svg></a><div class="rail-sections">${railItems.map(n=>`<a class="rail-button ${n===destination?'selected':''}" href="${n.href}" data-nav-href="${n.href}" title="${n.label}" aria-label="${n.label}">${icon(n.icon,20)}</a>`).join('')}<button class="rail-button" id="rail-all-pages" title="Show all pages" aria-label="Show all pages">${icon('list',20)}</button></div><div class="sidebar-footer rail-footer"><button class="account-trigger" id="account-trigger" aria-label="Workspace account" aria-expanded="false"><span class="user-avatar" id="user-avatar">A</span></button><div class="account-menu menu-surface" id="account-menu" hidden><div class="menu-label">Workspace account</div><a href="system.html">${icon('controls')}System status</a><a href="reports.html#draft-tray">${icon('reports')}Working drafts</a><div class="menu-divider"></div><button id="signout-btn">${icon('logout')}${DEMO_MODE?'Exit demo':'Sign out'}</button></div></div></div>
    <section class="navigation-panel"><a class="navigation-wordmark" href="index.html"><strong>ACURION</strong><small>ANALYST WORKSPACE</small></a><nav class="sidebar-nav" id="context-navigation" aria-label="All workspace pages"><span class="nav-selection-marker" id="nav-selection" aria-hidden="true"></span>${navigation()}</nav><div class="navigation-analyst"><strong id="user-display">Loading session…</strong><small id="user-email"></small><a class="navigation-status" href="system.html">${icon('controls',12)}<span id="nav-data-status">${DEMO_MODE?'Demo data':'Checking data connection'}</span></a></div></section></div><div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-label="Resize navigation" aria-orientation="vertical" aria-valuemin="264" aria-valuemax="420" tabindex="0"></div></aside><div class="sidebar-overlay" id="overlay" hidden></div>
    <div class="app-main"><header class="app-header"><button class="icon-button" id="menuBtn" aria-label="Toggle sidebar">${icon('sidebar')}</button><div class="header-location" id="breadcrumbs"><a href="index.html">Workspace</a><span>/</span><span>${esc(destination.label)}</span></div><div class="header-actions"><button class="search-trigger" id="global-search">${icon('search',14)}<span>Find a page or record</span><kbd>⌘K</kbd></button><button class="icon-button" id="notifications-btn" aria-label="Open alert notifications">${icon('alerts')}</button><a href="system.html" class="workspace-mode">${icon('shield',12)}${mode}</a></div></header><main id="main-content" class="main-content"><div id="data-connection-notice" class="connection-notice" role="status" hidden></div><div class="view-heading"><div class="view-title">${icon(destination.icon,20)}<h1 id="page-title">${esc(active==='compliance.html'?destination.label:pageTitle)}</h1></div><p id="page-subtitle">${esc(active==='compliance.html'?destination.detail:pageSubtitle||'')}</p></div><div id="page-content"></div></main></div></div>
    <dialog id="search-dialog" class="command-dialog" aria-label="Search and commands"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close search">${icon('close')}</button></form><div class="command-input">${icon('search')}<input id="command-query" placeholder="Search pages, customers and cases" aria-label="Search pages, customers and cases" autocomplete="off"></div><div id="command-results" class="command-results"></div><div class="command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>enter</kbd> to open</span><span><kbd>esc</kbd> to close</span></div></dialog>
    <dialog id="notifications-dialog" class="panel-dialog" aria-label="Alert notifications"><div class="notification-chrome"><span>ACURION / ACTIVITY</span><form method="dialog"><button class="dialog-close icon-button" aria-label="Close notifications">${icon('close')}</button></form></div><div id="notification-list" class="notification-list"></div></dialog>`;
  const navigationRoot=document.getElementById('context-navigation'),selectionMarker=document.getElementById('nav-selection');
  let selectionHolding=false;
  try {const previous=Number(sessionStorage.getItem('acurion:nav-selection-y'));if(sessionStorage.getItem('acurion:nav-selection-y')!==null && Number.isFinite(previous) && !matchMedia('(prefers-reduced-motion:reduce)').matches){selectionMarker.style.setProperty('--selection-y',`${previous}px`);selectionHolding=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{selectionHolding=false;positionSelection();}));}}catch{}
  const positionSelection=()=>{
    if(selectionHolding)return;
    const selected=navigationRoot.querySelector('a[aria-current="page"]');
    if(!selected)return;
    const rect=selected.getBoundingClientRect(),parent=navigationRoot.getBoundingClientRect();
    if(!rect.width)return;
    selectionMarker.style.setProperty('--selection-y',`${rect.top-parent.top+navigationRoot.scrollTop}px`);
    selectionMarker.style.height=`${rect.height}px`;
  };
  const updateNavigation=()=>{
    document.querySelectorAll('#sidebar [data-nav-href]').forEach(link=>{
      const selected=link.dataset.navHref===destination.href;
      link.classList.toggle(link.classList.contains('rail-button')?'selected':'active',selected);
      if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
      const dot=link.querySelector('.nav-active-mark');if(dot)dot.hidden=!selected;
    });
    positionSelection();
  };
  const navigationResize=new ResizeObserver(positionSelection);navigationResize.observe(navigationRoot);
  window.addEventListener('pagehide',()=>navigationResize.disconnect(),{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted){navigationResize.observe(navigationRoot);updateNavigation();}});
  const shell=document.getElementById('app-shell'),narrow=matchMedia('(max-width:767px)');
  let open=!narrow.matches,width=292;
  try {width=Math.max(264,Math.min(420,Number(localStorage.getItem('acurion:sidebar-width'))||292));open=narrow.matches?false:localStorage.getItem('acurion:sidebar-open')!=='false';}catch{}
  const setSidebar=()=>{shell.style.setProperty('--sidebar-width',`${width}px`);shell.classList.toggle('sidebar-collapsed',!open);shell.classList.toggle('sidebar-mobile-open',narrow.matches&&open);document.getElementById('sidebar').inert=narrow.matches&&!open;document.getElementById('sidebar').setAttribute('aria-hidden',String(narrow.matches&&!open));document.getElementById('overlay').hidden=!(narrow.matches&&open);document.getElementById('menuBtn').setAttribute('aria-expanded',String(open));document.getElementById('sidebar-resizer').setAttribute('aria-valuenow',width);};
  setSidebar();updateNavigation();
  document.getElementById('menuBtn').onclick=()=>{open=!open;setSidebar();try{if(!narrow.matches)localStorage.setItem('acurion:sidebar-open',String(open));}catch{}};
  document.getElementById('rail-all-pages').onclick=()=>{open=true;setSidebar();};
  document.getElementById('overlay').onclick=()=>{open=false;setSidebar();};
  narrow.addEventListener('change',()=>{open=!narrow.matches;setSidebar();});
  const resizer=document.getElementById('sidebar-resizer');
  const rememberWidth=()=>{try{localStorage.setItem('acurion:sidebar-width',String(width));}catch{}};
  resizer.onpointerdown=event=>{if(narrow.matches||!open)return;resizer.setPointerCapture(event.pointerId);shell.classList.add('resizing');const move=e=>{width=Math.max(264,Math.min(420,Math.round(e.clientX)));setSidebar();};const end=()=>{shell.classList.remove('resizing');resizer.removeEventListener('pointermove',move);rememberWidth();};resizer.addEventListener('pointermove',move);resizer.addEventListener('pointerup',end,{once:true});resizer.addEventListener('pointercancel',end,{once:true});};
  resizer.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();width=event.key==='Home'?264:event.key==='End'?420:Math.max(264,Math.min(420,width+(event.key==='ArrowRight'?16:-16)));setSidebar();rememberWidth();};
  document.addEventListener('acurion:workspace-view',event=>{view=event.detail;destination=activeNavigation(active,view);updateNavigation();document.getElementById('breadcrumbs').innerHTML=`<a href="index.html">Workspace</a><span>/</span><span>${esc(destination.label)}</span>`;document.getElementById('page-title').textContent=destination.label;document.getElementById('page-subtitle').textContent=destination.detail;document.title=`Acurion - ${destination.label}`;});
  const accountMenu=document.getElementById('account-menu'),accountTrigger=document.getElementById('account-trigger');
  accountTrigger.onclick=()=>{accountMenu.hidden=!accountMenu.hidden;accountTrigger.setAttribute('aria-expanded',String(!accountMenu.hidden));};
  document.addEventListener('click',e=>{if(!e.target.closest('.sidebar-footer')){accountMenu.hidden=true;accountTrigger.setAttribute('aria-expanded','false');}});
  const setUser=(name,email)=>{document.getElementById('user-display').textContent=name;document.getElementById('user-avatar').textContent=name.slice(0,2).toUpperCase();document.getElementById('user-email').textContent=email;};
  if(DEMO_MODE)setUser('Demo analyst','Fictional records only');
  else onAuthStateChanged(auth,user=>{if(!user){if(active!=='system.html'){location.replace('login.html');return;}setUser('Not signed in','Firebase setup pending');}else if(authSettings(import.meta.env).enabled && requiresEmailVerification(user)) { location.replace('verify-email.html'); } else setUser(user.displayName||user.email?.split('@')[0]||'Analyst',user.email||'');});
  document.getElementById('signout-btn').onclick=async()=>{try{sessionStorage.removeItem('acurion:demo');}catch{}if(!DEMO_MODE)await signOut(auth);navigateSmoothly('login.html');};
  const disposeStatus=observeDataStatus(records=>{
    const failures=records.filter(r=>r.state==='error'),ready=records.filter(r=>r.state==='ready'||r.state==='empty'),loading=records.some(r=>r.state==='loading');
    document.getElementById('nav-data-status').textContent=DEMO_MODE?'Demo data':failures.length?'Data needs attention':ready.length?'Read verified':loading?'Loading records':'Awaiting data read';
    const notice=document.getElementById('data-connection-notice');
    notice.hidden=DEMO_MODE||!failures.length||isSandbox;
    if(!notice.hidden)notice.innerHTML=`<span>${failures.length} data source${failures.length===1?'':'s'} could not be read. Records shown may be incomplete.</span><a class="text-button" href="system.html">Check System status →</a>`;
  });
  window.addEventListener('pagehide',disposeStatus,{once:true});
  const search=document.getElementById('search-dialog'),input=document.getElementById('command-query'),results=document.getElementById('command-results');
  let searchable=[],currentResults=[],cursor=0;
  const updateResults=()=>{currentResults=searchable.filter(n=>`${n.label} ${n.detail}`.toLowerCase().includes(input.value.toLowerCase())).slice(0,18);cursor=Math.min(cursor,Math.max(0,currentResults.length-1));results.innerHTML=`<p class="menu-label">${input.value?'Matching pages & records':'Go to'}</p>${currentResults.map((n,i)=>`<a href="${esc(n.href)}" class="command-result ${i===cursor?'selected':''}">${icon(n.icon)}<span>${esc(n.label)}<small>${esc(n.detail)}</small></span><span class="result-enter">↵</span></a>`).join('')||'<div class="empty">Nothing matches that search.</div>'}`;};
  const openSearch=()=>{searchable=[...NAV_ITEMS,{href:'reports.html#draft-tray',label:'Working drafts',icon:'reports',detail:'Temporary notes and recovery'}];try{const stored=JSON.parse(localStorage.getItem('acurion.compliance.sandbox.v1')||'{}');searchable.push(...(stored.customers||[]).map(c=>({label:c.name,detail:`Customer · ${c.id}`,icon:'customers',href:`compliance.html?view=customers&customer=${encodeURIComponent(c.id)}`})),...(stored.cases||[]).map(c=>({label:c.id,detail:`Case · ${c.customerId}`,icon:'cases',href:`compliance.html?view=cases&case=${encodeURIComponent(c.id)}`})));}catch{}updateResults();search.showModal();input.focus();};
  document.getElementById('global-search').onclick=openSearch;input.oninput=()=>{cursor=0;updateResults();};
  input.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();cursor=Math.max(0,Math.min(currentResults.length-1,cursor+(event.key==='ArrowDown'?1:-1)));updateResults();results.querySelector('.selected')?.scrollIntoView({block:'nearest'});}if(event.key==='Enter'&&currentResults[cursor]){event.preventDefault();navigateSmoothly(currentResults[cursor].href);}};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.open?search.close():openSearch();}if(event.key==='Escape'){if(narrow.matches&&open&&!document.querySelector('dialog[open]')){open=false;setSidebar();document.getElementById('menuBtn').focus();}accountMenu.hidden=true;accountTrigger.setAttribute('aria-expanded','false');}});
  let disposeNotifications;const notificationDialog=document.getElementById('notifications-dialog');
  notificationDialog.addEventListener('close',()=>{disposeNotifications?.();disposeNotifications=undefined;});
  document.getElementById('notifications-btn').onclick=async()=>{notificationDialog.showModal();const list=document.getElementById('notification-list');list.innerHTML='<div class="feed-loading">Loading alert activity…</div>';try{const{mountNotifications}=await import('../islands/notifications.tsx');if(notificationDialog.open){disposeNotifications?.();disposeNotifications=mountNotifications(list);}}catch{list.innerHTML='<p class="helper">The alert feed could not be loaded. Check System status.</p>';}};
  for(const dialog of root.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  installRecordMenu(document.getElementById('page-content'));
  return document.getElementById('page-content');
}
