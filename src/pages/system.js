import { fieldCoverage } from '../lib/fieldCoverage.js';
import '../styles/main.css';
import { renderLayout } from '../components/layout.js';
import { escapeHTML as esc } from '../components/icons.js';
import { auth, firebaseConfig } from '../lib/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { DEMO_MODE, READ_LIMIT, DATA_PATHS, LEGACY_FIRESTORE_AUDIT } from '../lib/config.js';
import { observeDataStatus, dataErrorDetails } from '../lib/dataStatus.js';
import { checkDataConnection, getAlerts, getTransactions, getMyRole } from '../lib/dataService.js';
import { watchHost } from '../lib/hostDesk.js';
import { describeK7, relativeTime } from '../lib/hostStatus.js';
import { workspaceInfo, loadWorkspace, resetLocalWorkspace } from '../lib/complianceStore.js';
import { verifyChain } from '../lib/auditChain.js';
import { formatDateTime } from '../lib/utils.js';
import { notify, notifyBusy } from '../lib/notify.js';
const main=renderLayout({active:'system.html',pageTitle:'System status',pageSubtitle:'Is everything working?'});
// A status board first: one sentence and five tiles anyone can read. The technical detail follows, folded.
const tile=(id,name,label)=>`<div class="status-tile" id="tile-${id}" data-tone="neutral"><span class="status-tile-orb" aria-hidden="true"></span><div><span class="status-tile-name">${name}</span><strong data-field="value">${label}</strong><small data-field="note"></small></div></div>`;
const fold=(id,title,body,open=false)=>`<details class="card tech-fold" id="${id}"${open?' open':''}><summary><span>${title}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="tech-fold-body">${body}</div></details>`;
main.innerHTML=`<section class="status-board" data-tone="neutral"><div class="status-headline"><span class="status-headline-orb" aria-hidden="true"></span><div><h2 id="status-headline">Checking everything…</h2><p id="connection-summary">${DEMO_MODE?'Demo workspace: sample data kept in this browser.':'Checking your session…'}</p></div><div class="status-actions"><button class="btn-primary" id="check-connection">${DEMO_MODE?'Refresh demo records':'Check connection'}</button>${DEMO_MODE?'<button class="btn-ghost" id="reset-demo">Reset demo</button>':''}</div></div>
  <div class="status-tiles">${tile('data','Data','Checking…')}${tile('account','Your account','Checking…')}${tile('k7','Acurion K7','Checking…')}${tile('cases','Case workspace','Checking…')}${tile('audit','Audit trail','Checking…')}</div><a class="text-button" id="session-action" hidden></a></section>
  <h2 class="tech-heading">Technical details</h2>
  ${fold('workspace-connection','Workspace connection',`<dl class="detail-list"><div><dt>Mode</dt><dd>${DEMO_MODE?'Demo / browser storage':'Firebase'}</dd></div><div><dt>Project</dt><dd>${esc(firebaseConfig.projectId)}</dd></div><div><dt>Database type</dt><dd>Realtime Database</dd></div><div><dt>Database</dt><dd>${esc(firebaseConfig.databaseURL)}</dd></div><div><dt>Session</dt><dd id="session-status">Checking session…</dd></div><div><dt>Account ID</dt><dd id="session-account-id">Checking session…</dd><dd><small>Your Firebase user ID. An admin needs it to give you a role. It is not a password.</small></dd></div><div><dt>Records per check</dt><dd>Up to ${READ_LIMIT} per source<small>Counts and totals describe this sample, which may not hold the newest records.</small></dd></div></dl>`)}
  ${fold('services','Platform services',`<dl class="detail-list" id="platform-services"><div><dt>Loading</dt><dd>Checking services…</dd></div></dl><p class="helper">At higher volumes, Kafka and Flink take over event streaming and a Neo4j graph store backs network queries. The data contracts in docs/DATA_CONTRACTS.md stay the same.</p>`)}
  ${fold('sources','Data source checks',`<p class="helper">Transactions, alerts and audit activity are read from Realtime Database.${LEGACY_FIRESTORE_AUDIT?' Legacy Firestore audit is also enabled.':''}</p><div id="source-checks" aria-live="polite"></div>`)}
  ${fold('access-help','How to restore access',`<ol class="setup-list"><li>Confirm the records are in Realtime Database at the address above. Records stored only in Cloud Firestore need a separate adapter.</li><li>Confirm the transaction and alert paths match the configured source paths below.</li><li>Verify your email. Every verified account can read the workspace; if a read is still denied, ask your administrator to publish the current firebase/database.rules.json.</li><li>Run the connection check after correcting source configuration or account access. A successful empty read is different from a failed read.</li></ol><p class="helper">Default paths: ${Object.entries(DATA_PATHS).map(([key,path])=>`<code>${esc(key)}: /${esc(path)}</code>`).join(' · ')}.</p>`,location.hash==='#access-help')}
  ${fold('dataset-coverage','Dataset field coverage',`<p class="helper">Known column names are mapped automatically and missing values are never invented. Counts cover only the loaded sample.</p><div id="field-coverage" class="mt-3">Run a connection check to inspect the loaded records.</div>`)}
  <div id="workspace-updates" class="mt-5"></div>`;
// Tiles: a tone (ok, warn, crit, neutral), a word and a short note.
const setTile=(id,tone,value,note='')=>{const t=document.getElementById(`tile-${id}`);if(!t)return;t.dataset.tone=tone;t.querySelector('[data-field=value]').textContent=value;t.querySelector('[data-field=note]').textContent=note;updateHeadline();};
function updateHeadline(){
  const tones=[...document.querySelectorAll('.status-tile')].map(t=>t.dataset.tone),bad=tones.filter(t=>t==='crit'||t==='warn').length,board=document.querySelector('.status-board');
  board.dataset.tone=tones.includes('crit')?'crit':bad?'warn':tones.every(t=>t==='neutral')?'neutral':'ok';
  document.getElementById('status-headline').textContent=bad?`${bad} ${bad===1?'thing needs':'things need'} attention`:tones.every(t=>t==='neutral')?'Checking everything…':'Everything is working';
}
let latestRecords=[];
observeDataStatus(records=>{
  latestRecords=records;
  const errors=records.filter(r=>r.state==='error'),loading=records.some(r=>r.state==='loading');
  if(errors.length)setTile('data','crit','Can’t read some data',`${errors.length} source${errors.length===1?'':'s'} failed. See Data source checks.`);
  else if(!loading&&records.length)setTile('data','ok',DEMO_MODE?'Demo data':'Connected',`${records.filter(r=>r.state==='ready'||r.state==='empty').length} sources read`);
  document.getElementById('source-checks').innerHTML=records.length?`<div class="table-wrap"><table class="workspace-table"><thead><tr><th>Source</th><th>State</th><th>Loaded</th><th>Last success</th><th>Detail</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(r.resource)}<small>/${esc(r.path||'')}</small></td><td><span class="badge badge-${({ready:'ok',empty:'info',error:'critical',loading:'medium'})[r.state]||'neutral'}">${esc(r.state)}</span></td><td>${r.count??'Not measured'}</td><td>${formatDateTime(r.lastSuccess)}</td><td>${r.state==='error'?`${(()=>{const d=dataErrorDetails({code:r.error},{path:r.path,user:auth.currentUser,operation:r.resource.includes('write')?'write':'read'});return `<strong>${esc(d.title)}</strong><p>${esc(d.message)}</p><a class="text-button" href="${esc(d.href)}">${esc(d.label)}</a><small>${esc(d.code)}</small>`;})()}`:r.state==='loading'?'Checking source access…':r.state==='empty'?'Read succeeded; this path has no records.':r.mode==='demo'?'Demo workspace records':'Authenticated source read'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="data-empty"><strong>No source checks yet</strong><p>Run a connection check to test each source.</p></div>';
});
onAuthStateChanged(auth,user=>{
  if(DEMO_MODE)setTile('account','ok','Demo','No sign-in needed');
  else if(!user)setTile('account','warn','Not signed in','Sign in to see your team’s data');
  else if(!user.emailVerified)setTile('account','warn','Email not verified','Verify it to open the workspace');
  else getMyRole().then(role=>setTile('account',role==='viewer'?'warn':'ok',`${role[0].toUpperCase()}${role.slice(1)}`,role==='viewer'?'Read-only: ask an admin for the analyst role':user.email||''));
  document.getElementById('session-status').textContent=DEMO_MODE?'Demo, no Firebase sign-in required':user?`Signed in${user.email?` as ${user.email}`:''}`:'Not signed in';
  document.getElementById('session-account-id').textContent=DEMO_MODE?'Demo account':user?.uid||'Not signed in';
  document.getElementById('connection-summary').textContent=DEMO_MODE?'Demo workspace: sample data kept in this browser. Sign in for K7 and uploads.':user?(user.emailVerified?`Signed in as ${user.email||'your account'}.`:'Signed in, but your email is not verified yet.'):'Sign in to see your team’s data.';
  const action=document.getElementById('session-action');
  action.href=DEMO_MODE?'index.html':user?(user.emailVerified?'transactions.html':'verify-email.html'):'login.html';
  action.textContent=DEMO_MODE?'Open demo workspace':user?(user.emailVerified?'View transactions':'Verify my email'):'Sign in or explore demo';
  action.hidden=false;
});
const button=document.getElementById('check-connection');
let firstCheck=true;
button.onclick=async()=>{button.disabled=true;button.textContent='Checking…';const quiet=firstCheck;firstCheck=false;const work=quiet?null:notifyBusy('Checking the connection…');try{await checkDataConnection();
    const results=await Promise.allSettled([getTransactions(),getAlerts()]);
    document.getElementById('field-coverage').innerHTML=results.map((result,index)=>{
      const kind=index?'alerts':'transactions';
      if(result.status==='rejected')return `<p class="helper">${kind}: coverage unavailable because the source read failed.</p>`;
      const records=result.value,rows=fieldCoverage(records,kind);
      return `<details class="coverage-group" ${!index?'open':''}><summary>${records.length} loaded ${kind} · field availability</summary><div class="table-wrap"><table class="workspace-table"><thead><tr><th>Field</th><th>Present / loaded</th><th>Missing</th><th>Mapped source columns</th><th>Provided by</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.label)}</td><td>${row.present} / ${row.total}</td><td>${row.missing}</td><td>${esc(row.columns.join(', ')||'Canonical / derived record key, or unavailable')}</td><td>${esc(row.owner)}</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('');
    const failedSources=latestRecords.filter(r=>r.state==='error').length;
    if(failedSources)work?.fail({title:`${failedSources} source${failedSources===1?'':'s'} failed`,detail:'Open Data source checks for the reason.'});else work?.done({title:DEMO_MODE?'Demo records refreshed':'All sources connected',detail:`${latestRecords.filter(r=>r.state!=='error').length} sources read`});
  }catch(error){work?.fail({title:'Check failed',detail:error.message});}finally{button.disabled=false;button.textContent=DEMO_MODE?'Refresh demo records':'Check connection';}};
button.click();

import { mountWorkspaceUpdates } from '../islands/workspace-updates.tsx';
// Platform services: each row reports what is actually running, not what is planned.
let host=null;
async function renderServices(){
  const live=(text,tone='ok')=>`<span class="badge badge-plain badge-${tone}">${esc(text)}</span>`;
  const role=await getMyRole();
  const chain=verifyChain(loadWorkspace().audit),info=workspaceInfo();
  const k7Label={running:'Running',ready:'Ready','getting ready':'Loading',paused:'Paused',finished:'Finished',failed:'Needs attention',offline:'Offline'};
  const online=host?.connection==='online';
  const rows=[
    ['Detection model',DEMO_MODE&&host?.connection==='signed-out'?`${live('Sign in','neutral')} <small>Acurion K7, the real-time laundering model, runs on the team's Acurion host</small>`:online?`${live(k7Label[host.k7.state]||'Offline',host.k7.state==='failed'?'critical':['running','ready','paused'].includes(host.k7.state)?'ok':'neutral')} <small>Acurion K7 · ${esc(describeK7(host))}</small>`:`${live('Host offline','neutral')} <small>Acurion K7 runs on the Acurion host${host?.lastSeen?`, last seen ${esc(relativeTime(host.lastSeen,Date.now()))}`:''}</small>`],
    ['Upload scoring',online&&host.uploads.state!=='offline'?`${live(host.uploads.state==='busy'?'Analysing':'Ready')} <small>Acurion core model scores uploaded CSV datasets on the host</small>`:`${live(DEMO_MODE?'Sign in':'Offline','neutral')} <small>Acurion core model on the Acurion host${host?.uploads?.problem?` · ${esc(host.uploads.problem)}`:''}</small>`],
    ['Rules engine',`${live('Live')} <small>Velocity, near-threshold and profile rules with explainable points</small>`],
    ['Realtime alert stream',DEMO_MODE?`${live('Demo data','neutral')} <small>Signed in, new alerts appear on every page as they are written</small>`:`${live('Live')} <small>Firebase realtime listeners update the alert queue and the header island</small>`],
    ['Graph analysis',`${live('Live')} <small>In-app network engine: neighbourhoods, dated path tracing, networks found in uploads</small>`],
    ['Case workspace',`${live(info.encrypted?'Encrypted':'Not encrypted',info.encrypted?'ok':'critical')} <small>${esc(info.label)} · AES-256-GCM, PBKDF2 key</small>`],
    ['Audit trail',`${live(chain.ok?'Verified':'Integrity failure',chain.ok?'ok':'critical')} <small>SHA-256 hash chain · ${chain.checked} workspace events</small>`],
    ['Access control',`${live(DEMO_MODE?'Demo reviewer':`${role[0].toUpperCase()}${role.slice(1)}`)} <small>Verified accounts are analysts; reviewers and admins close alerts, file cases and run K7. Enforced by Firebase rules</small>`],
    ['Report filing',`${live('Live')} <small>Signed report packages and goAML XML for upload to the FIU portal</small>`],
  ];
  document.getElementById('platform-services').innerHTML=rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  if(host?.connection==='signed-out'||(DEMO_MODE&&!online))setTile('k7','neutral','Sign in','Runs on your team’s Acurion computer');
  else if(online)setTile('k7',host.k7.state==='failed'?'crit':['running','ready','paused','finished'].includes(host.k7.state)?'ok':'neutral',k7Label[host.k7.state]||'Offline',host.uploads.state==='offline'?'Uploads offline':'Uploads ready');
  else setTile('k7','warn','Offline',host?.lastSeen?`Last seen ${relativeTime(host.lastSeen,Date.now())}`:'The Acurion computer is not connected');
  setTile('cases',info.readOnly?'warn':info.encrypted?'ok':'warn',info.readOnly?'Read-only':info.encrypted?'Encrypted':'Not encrypted',info.label);
  setTile('audit',chain.ok?'ok':'crit',chain.ok?'Intact':'Check failed',chain.ok?(chain.checked?`${chain.checked} events, none changed`:'No changes recorded yet'):chain.reason||'');
}
renderServices();
watchHost(status=>{const changed=host?.connection!==status.connection||host?.k7.state!==status.k7.state||host?.uploads.state!==status.uploads.state;host=status;if(changed)renderServices();});
document.getElementById('reset-demo')?.addEventListener('click',async event=>{if(!confirm('Reset the demo workspace on this device? Cases, reviews and uploads made here will be deleted.'))return;notify({tone:'ok',title:'Demo reset',detail:'A fresh workspace with the sample data.'},{next:true});event.currentTarget.disabled=true;await resetLocalWorkspace();location.reload();});
mountWorkspaceUpdates(document.getElementById('workspace-updates'));
