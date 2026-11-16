import { installCustomSelects } from './customSelect.js';
import { connectionState } from '../lib/connectionState.js';
import { navigateSmoothly } from '../lib/motion.js';
import { authSettings,requiresEmailVerification } from '../lib/authPolicy.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase.js';
import { onValue, ref } from 'firebase/database';
import { DEMO_MODE, ENV_DEMO, exitDemo } from '../lib/config.js';
import { installUploadDialog } from './uploadDialog.js';
import { NAV_ITEMS, activeNavigation } from '../lib/navigation.js';
import { observePageDataStatus, dataErrorDetails } from '../lib/dataStatus.js';
import { icon, escapeHTML as esc } from './icons.js';
import { installRecordMenu } from './recordMenu.js';
import { installTooltips } from './tooltip.js';
import { installInfoPops } from './infoPop.js';
import { notify, tipOnce } from '../lib/notify.js';
import { installRowLinks } from './rowLinks.js';
import { workspaceInfo, lockWorkspace } from '../lib/complianceStore.js';
import { getMyRole } from '../lib/dataService.js';
import { mountNavigationDock } from '../islands/navigation-dock.tsx';
import { mountWorkspaceMap } from '../islands/workspace-map.tsx';
export function renderLayout({active,pageTitle,pageSubtitle,actions=''}) {
  installTooltips();
  installInfoPops();
  installCustomSelects();
  const root=document.getElementById('app');
  let view=new URLSearchParams(location.search).get('view')||'customers';
  let destination=activeNavigation(active,view);
  const isSandbox=active==='compliance.html';
  const mode=isSandbox?'Encrypted case workspace':DEMO_MODE?'Demo workspace':'Live workspace';
  const modeKey=isSandbox?'sandbox':DEMO_MODE?'demo':'live';
  const mark=`<span class="brand-glyph"><svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true"><path d="m5 25 11-20 11 20M10 20h12M16 5v10" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="25" r="2.3"/></svg></span>`;
  root.innerHTML=`<div class="app-shell map-shell" id="app-shell"><a class="skip-link" href="#main-content">Skip to content</a><div class="app-main"><header class="app-header workspace-header"><a href="index.html" class="workspace-brand" aria-label="Acurion overview">${mark}<strong>ACURION</strong></a><div class="header-location" id="breadcrumbs"><span>${esc(destination.group)}</span><span>/</span><span>${esc(destination.label)}</span></div><div id="host-island-root" class="host-island-root"></div><div class="header-actions"><button class="search-trigger" id="global-search" aria-label="Find a page or record" aria-keyshortcuts="Meta+K Control+K">${icon('search',18)}<span>Search pages and records</span><kbd>⌘K</kbd></button><button class="icon-button header-icon-button" id="notifications-btn" aria-label="Open alert notifications" data-tooltip="Open the alert activity feed from your current data source.">${icon('alerts',18)}</button><button class="icon-button header-icon-button workspace-lock" id="lock-workspace" aria-label="Lock the encrypted case workspace" data-tooltip="Case workspace: ${esc(workspaceInfo().label)}. Click to lock it now."><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></button><a href="system.html" class="header-data-status" data-tooltip="See your session, record access and individual source checks."><span class="status-orbit" aria-hidden="true"></span><span id="nav-data-status">${DEMO_MODE?'Demo':'Check connection'}</span></a><div class="workspace-account"><button class="account-trigger" id="account-trigger" aria-label="Workspace account" aria-controls="account-menu" aria-expanded="false" data-tooltip="Your account, verification status and sign-out controls."><span class="user-avatar" id="user-avatar">A</span></button><div class="account-menu menu-surface" id="account-menu" hidden><div class="account-summary"><strong id="user-display">Loading session…</strong><small id="user-email" class="pii"></small><span id="account-verification">Checking verification…</span></div><div class="account-workspace"><span>${workspaceInfo().encrypted?'Encrypted':'Not encrypted'}</span>${esc(workspaceInfo().label)}</div><button id="mask-pii" role="menuitemcheckbox" aria-checked="false">${icon('eyeOff')}Mask personal data</button><a href="system.html">${icon('controls')}Connection & access</a><a href="reports.html#draft-tray">${icon('reports')}Working drafts</a><button id="lock-btn">${icon('shield')}Lock workspace</button><div class="menu-divider"></div><button id="signout-btn">${icon('logout')}${DEMO_MODE?'Exit demo':'Sign out'}</button></div></div></div></header><main id="main-content" class="main-content" tabindex="-1"><div class="page-container"><div class="workspace-page-meta" data-mode="${modeKey}"><span>${mode}</span><span>Financial intelligence / Analyst desk</span></div><div id="data-connection-notice" class="connection-notice" role="status" hidden></div><div class="view-heading"><div class="view-title"><div><div class="view-title-row"><h1 id="page-title">${esc(active==='compliance.html'?destination.label:pageTitle)}</h1></div><p id="page-subtitle">${esc(active==='compliance.html'?destination.detail:pageSubtitle||'')}</p></div></div><div class="view-actions" id="page-actions">${actions}</div></div><div id="page-content"></div></div></main></div></div>
    <div id="navigation-dock" class="navigation-dock-host"></div>
    <dialog id="workspace-map-dialog" class="workspace-map-dialog" aria-labelledby="workspace-map-title" data-sortable-scroll><button type="button" class="dialog-close icon-button" id="close-workspace-map" aria-label="Close workspace map" data-tooltip="Close the map and return to your current page.">${icon('close')}</button><div id="workspace-map-content"></div></dialog>
    <dialog id="search-dialog" class="command-dialog" aria-label="Search and commands"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close search">${icon('close')}</button></form><div class="command-input">${icon('search')}<input id="command-query" placeholder="Search pages, customers and cases" aria-label="Search pages, customers and cases" autocomplete="off"></div><div id="command-results" class="command-results"></div><div class="command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>enter</kbd> to open</span><span><kbd>esc</kbd> to close</span></div></dialog>
    <dialog id="notifications-dialog" class="panel-dialog" aria-label="Alert notifications"><div class="notification-chrome"><span>Notifications</span><form method="dialog"><button class="dialog-close icon-button" aria-label="Close notifications">${icon('close')}</button></form></div><div id="notification-list" class="notification-list"></div></dialog>`;
  if(!/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent))root.querySelector('.search-trigger kbd').textContent='Ctrl K';
  const mapDialog=document.getElementById('workspace-map-dialog');
  mountWorkspaceMap(document.getElementById('workspace-map-content'),destination.href);
  const openMap=()=>{mapDialog.showModal();mapDialog.querySelector('h2')?.focus();};
  mountNavigationDock(document.getElementById('navigation-dock'),destination.href,openMap);
  document.getElementById('close-workspace-map').onclick=()=>mapDialog.close();
  mapDialog.addEventListener('click',event=>{if(event.target.closest('a[href]')&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)mapDialog.close();});
  document.addEventListener('acurion:workspace-view',event=>{view=event.detail;destination=activeNavigation(active,view);document.dispatchEvent(new CustomEvent('acurion:map-location',{detail:destination.href}));document.getElementById('breadcrumbs').innerHTML=`<span>${esc(destination.group)}</span><span>/</span><span>${esc(destination.label)}</span>`;document.getElementById('page-title').textContent=destination.label;document.getElementById('page-subtitle').textContent=destination.detail;document.title=`Acurion - ${destination.label}`;});
  const accountMenu=document.getElementById('account-menu'),accountTrigger=document.getElementById('account-trigger');
  accountTrigger.onclick=()=>{accountMenu.hidden=!accountMenu.hidden;accountTrigger.setAttribute('aria-expanded',String(!accountMenu.hidden));};
  document.addEventListener('click',e=>{if(!e.target.closest('.workspace-account')){accountMenu.hidden=true;accountTrigger.setAttribute('aria-expanded','false');}});
  const setUser=(name,email,verification)=>{document.getElementById('user-display').textContent=name;document.getElementById('user-avatar').textContent=name.slice(0,2).toUpperCase();document.getElementById('user-email').textContent=email;document.getElementById('account-verification').textContent=verification;};
  if(DEMO_MODE)setUser('Demo analyst','Demo workspace','Demo session');
  else onAuthStateChanged(auth,user=>{if(!user){if(active!=='system.html'){location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop()+location.search+location.hash)}`);return;}setUser('Not signed in','Sign in to check your access','No active session');}else if(active!=='system.html'&&authSettings(import.meta.env).enabled&&requiresEmailVerification(user)){location.replace('verify-email.html');}else setUser(user.displayName||user.email?.split('@')[0]||'Analyst',user.email||'',user.emailVerified?'Email verified':'Email not verified');});
  document.getElementById('signout-btn').onclick=async()=>{try{await lockWorkspace();exitDemo();if(!DEMO_MODE)await signOut(auth);navigateSmoothly(ENV_DEMO?'login.html?exit=1':'login.html');}catch{const notice=document.getElementById('data-connection-notice');notice.hidden=false;notice.textContent='Sign-out could not be completed. Check your connection, then try Sign out again.';}};
  let latestSourceStatus=[],transport=DEMO_MODE?undefined:null;
  const updateConnection=()=>{const status=connectionState(latestSourceStatus,{demo:DEMO_MODE,online:navigator.onLine,transport});const indicator=document.querySelector('.header-data-status');indicator.dataset.state=status.state;indicator.dataset.tooltip=status.detail;document.getElementById('nav-data-status').textContent=status.label;};
  window.addEventListener('online',()=>{updateConnection();notify({tone:'ok',title:'Back online',detail:'You can save again.'});});
  window.addEventListener('offline',()=>{updateConnection();notify({tone:'warn',title:'You’re offline',detail:'Changes can’t be saved until you reconnect.',sticky:true});});
  let stopTransport;
  const watchTransport=()=>{if(!DEMO_MODE&&!stopTransport)stopTransport=onValue(ref(db,'.info/connected'),snapshot=>{transport=snapshot.val()===true;updateConnection();},()=>{transport=false;updateConnection();});};
  window.addEventListener('pagehide',()=>{stopTransport?.();stopTransport=undefined;});
  window.addEventListener('pageshow',watchTransport);watchTransport();
  observePageDataStatus(records=>{
    latestSourceStatus=records;updateConnection();
    const failures=records.filter(r=>r.state==='error');
    const notice=document.getElementById('data-connection-notice');
    notice.hidden=DEMO_MODE||!failures.length||isSandbox;
    if(!notice.hidden){const first=failures[0],detail=dataErrorDetails({code:first.error},{path:first.path,user:auth.currentUser,operation:first.resource.includes('write')?'write':'read'});notice.innerHTML=`<div><strong>${esc(detail.title)}</strong><span>${esc(detail.message)}</span></div><a class="text-button" href="${esc(detail.href)}">${esc(detail.label)}</a>`;}
  });
  const search=document.getElementById('search-dialog'),input=document.getElementById('command-query'),results=document.getElementById('command-results');
  let searchable=[],currentResults=[],cursor=0;
  const updateResults=()=>{currentResults=searchable.filter(n=>`${n.label} ${n.detail}`.toLowerCase().includes(input.value.toLowerCase())).slice(0,18);cursor=Math.min(cursor,Math.max(0,currentResults.length-1));results.innerHTML=`<p class="menu-label">${input.value?'Matching pages & records':'Go to'}</p>${currentResults.map((n,i)=>`<a href="${esc(n.href)}" class="command-result ${i===cursor?'selected':''}">${icon(n.icon)}<span>${esc(n.label)}<small>${esc(n.detail)}</small></span><span class="result-enter">↵</span></a>`).join('')||'<div class="empty">Nothing matches that search.</div>'}`;};
  const openSearch=()=>{searchable=[...NAV_ITEMS,{href:'reports.html#draft-tray',label:'Working drafts',icon:'reports',detail:'Temporary notes and recovery'}];try{const stored=JSON.parse(localStorage.getItem('acurion.compliance.sandbox.v2')||'{}');searchable.push(...(stored.customers||[]).map(c=>({label:c.name,detail:`Customer · ${c.id}`,icon:'customers',href:`compliance.html?view=customers&customer=${encodeURIComponent(c.id)}`})),...(stored.cases||[]).map(c=>({label:c.id,detail:`Case · ${c.customerId}`,icon:'cases',href:`compliance.html?view=cases&case=${encodeURIComponent(c.id)}`})));}catch{}updateResults();search.showModal();input.focus();};
  document.getElementById('global-search').onclick=openSearch;input.oninput=()=>{cursor=0;updateResults();};
  // Click and Enter share the same route handling, including smooth local workspace views.
  results.addEventListener('click',event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.target.closest('a[href]'))search.close();});
  input.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();cursor=Math.max(0,Math.min(currentResults.length-1,cursor+(event.key==='ArrowDown'?1:-1)));updateResults();results.querySelector('.selected')?.scrollIntoView({block:'nearest'});}if(event.key==='Enter'&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&currentResults[cursor]){event.preventDefault();results.querySelector('.selected')?.click();}};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.open?search.close():openSearch();}if(event.key==='Escape'&&!event.defaultPrevented){accountMenu.hidden=true;accountTrigger.setAttribute('aria-expanded','false');}if(event.key.toLowerCase()==='m'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable=\"true\"]')&&!document.querySelector('dialog[open]')){event.preventDefault();openMap();}});
  let disposeNotifications;const notificationDialog=document.getElementById('notifications-dialog');
  notificationDialog.addEventListener('close',()=>{disposeNotifications?.();disposeNotifications=undefined;});
  document.getElementById('notifications-btn').onclick=async()=>{notificationDialog.showModal();const list=document.getElementById('notification-list');list.innerHTML='<div class="feed-loading">Loading alert activity…</div>';try{const{mountNotifications}=await import('../islands/notifications.tsx');if(notificationDialog.open){disposeNotifications?.();disposeNotifications=mountNotifications(list);}}catch{list.innerHTML='<p class="helper">The alert feed could not be loaded. Check System status.</p>';}};
  // Any modal (including page drawers rendered later) closes when its backdrop is clicked.
  document.addEventListener('click',event=>{const dialog=event.target;if(!(dialog instanceof HTMLDialogElement)||!dialog.open||dialog.classList.contains('dock-mobile-dialog'))return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  installRowLinks();
  installUploadDialog();
  // The header pill: K7's live state when signed in, and on every page the pop-ups and the upload flow.
  import('../islands/host-island.tsx').then(({mountHostIsland})=>mountHostIsland(document.getElementById('host-island-root'))).catch(()=>{});
  getMyRole().then(role=>{const label=document.getElementById('account-verification');if(label&&role)label.dataset.role=role;const tag=document.createElement('em');tag.className='account-role';tag.textContent=role==='viewer'?'Read-only access':`${role[0].toUpperCase()}${role.slice(1)} role`;document.querySelector('.account-summary')?.append(tag);});
  // Lock, inactivity and screen-sharing controls for the encrypted workspace.
  const lockNow=async(reason='')=>{await lockWorkspace();if(reason==='idle'&&!DEMO_MODE){try{await signOut(auth);}catch{}location.replace(`login.html?idle=1&next=${encodeURIComponent(location.pathname.split('/').pop()+location.search)}`);return;}location.reload();};
  document.getElementById('lock-workspace').onclick=()=>lockNow();
  document.getElementById('lock-btn').onclick=()=>lockNow();
  const IDLE_MS=15*60*1000;let idleTimer;
  const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>lockNow('idle'),IDLE_MS);};
  for(const type of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(type,resetIdle,{passive:true});
  // Moving the mouse counts as activity too (throttled), so a presenter is not signed out mid-demo.
  let lastMove=0;window.addEventListener('pointermove',()=>{const now=Date.now();if(now-lastMove>5000){lastMove=now;resetIdle();}},{passive:true});
  resetIdle();
  const maskButton=document.getElementById('mask-pii');
  const applyMask=on=>{document.documentElement.classList.toggle('mask-pii',on);maskButton.setAttribute('aria-checked',String(on));maskButton.classList.toggle('is-on',on);try{sessionStorage.setItem('acurion:mask-pii',on?'1':'0');}catch{}};
  try{applyMask(sessionStorage.getItem('acurion:mask-pii')==='1');}catch{}
  maskButton.onclick=()=>{const on=!document.documentElement.classList.contains('mask-pii');applyMask(on);accountMenu.hidden=true;notify(on?{tone:'info',title:'Personal data hidden',detail:'Names and account numbers are blurred for screen sharing.'}:{tone:'info',title:'Personal data shown'});};
  document.addEventListener('acurion:workspace-status',event=>{const status=event.detail,notice=document.getElementById('data-connection-notice');if(status.state==='error'){notice.hidden=false;notice.innerHTML=`<div><strong>Changes were not saved</strong><span>${esc(status.message)}</span></div>${status.code==='workspace/conflict'?'<button class="text-button" data-reload>Reload</button>':''}`;notice.querySelector('[data-reload]')?.addEventListener('click',()=>location.reload());}else if(status.state==='saved'&&notice.textContent.includes('Changes were not saved'))notice.hidden=true;});
  installRecordMenu(document.getElementById('page-content'));
  // First visit to each page: one short tip in the pill.
  const TIPS={'index.html':'Start here. The three tiles show what needs you today.','alerts.html':'Open any alert to see why it was flagged, then pick a decision.','transactions.html':'Click a payment to see who sent it, who got it and its risk.','graph.html':'Click an account to see its links. Scroll to zoom, drag to move.','reports.html':'Reports are signed, so anyone can check they were not changed.','system.html':'Green means connected. Check connection tests everything again.','compliance.html?view=customers':'Click a customer to see their risk and checks.','compliance.html?view=screening':'Press Screen everyone to check every customer against the watchlist.','compliance.html?view=monitoring':'Run monitoring to score every payment with the rules.','compliance.html?view=cases':'Open a case to write it up and export a signed report.','compliance.html?view=controls':'Policies set the limits the rules use in this workspace.'};
  const tipFor=()=>active==='compliance.html'?`compliance.html?view=${view}`:active;
  if(TIPS[tipFor()])tipOnce(tipFor(),TIPS[tipFor()]);
  document.addEventListener('acurion:workspace-view',()=>{if(TIPS[tipFor()])tipOnce(tipFor(),TIPS[tipFor()],{delay:600});});
  return document.getElementById('page-content');
}
