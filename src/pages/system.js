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
const main=renderLayout({active:'system.html',pageTitle:'System status',pageSubtitle:'Verified data reads, source paths and available services'});
main.innerHTML=`<section class="status-banner"><span class="icon-chip ${DEMO_MODE?'violet':'info'}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></span><div><h2>Connection overview</h2><p id="connection-summary">${DEMO_MODE?'Demo workspace: sample customers and rule alerts, kept in this browser. Sign in for Acurion K7 and dataset uploads.':'Checking your session…'}</p></div><button class="btn-primary" id="check-connection" data-tooltip="Checks your session and reads alerts, transactions and audit activity. It does not edit records or change Firebase permissions.">${DEMO_MODE?'Refresh demo records':'Check connection'}</button>${DEMO_MODE?'<button class="btn-ghost" id="reset-demo" data-tooltip="Deletes the demo case workspace on this device (cases, reviews, uploads) and starts again with a new passphrase.">Reset demo workspace</button>':''}</section><div class="workspace-columns mb-5"><section class="card"><h3>Workspace connection</h3><dl class="detail-list"><div><dt>Mode</dt><dd>${DEMO_MODE?'Demo / browser storage':'Firebase'}</dd></div><div><dt>Project</dt><dd>${esc(firebaseConfig.projectId)}</dd></div><div><dt>Database type</dt><dd>Realtime Database</dd></div><div><dt>Database</dt><dd>${esc(firebaseConfig.databaseURL)}</dd></div><div><dt>Session</dt><dd id="session-status">Checking session…</dd></div><div><dt>Account ID <button type="button" class="help-tip" aria-label="What is my Account ID?" data-tooltip="Your Firebase Authentication UID. Your administrator may need this ID if workspace rules require individual approval. It is not your password.">?</button></dt><dd id="session-account-id">Checking session…</dd></div><div><dt>Records per check <button type="button" class="help-tip" aria-label="About the record limit" data-tooltip="Acurion loads a bounded sample, ordered by Firebase key. Counts and totals describe that sample and may not include the latest transactions.">?</button></dt><dd>Up to ${READ_LIMIT} records per source</dd></div></dl><p class="helper">Each check loads up to ${READ_LIMIT} records per source. Dashboard totals reflect those records, which may not be the newest transactions.</p><a class="text-button" id="session-action" hidden></a></section><section class="card"><h3>Platform services</h3><p class="helper">What powers this workspace right now.</p><dl class="detail-list" id="platform-services"><div><dt>Loading</dt><dd>Checking services…</dd></div></dl><p class="helper">Scale-up path: at higher volumes, Kafka and Flink take over event streaming and a Neo4j graph store backs network queries. The data contracts in docs/DATA_CONTRACTS.md stay the same.</p></section></div><section class="card"><h3>Data source checks</h3><p class="helper">Transactions, alerts and audit activity are read from Realtime Database.${LEGACY_FIRESTORE_AUDIT?' Legacy Firestore audit is also enabled.':''}</p><div id="source-checks" aria-live="polite"></div></section><section class="card mt-5" id="access-help"><h3>How to restore access</h3><ol class="setup-list"><li>Confirm the records are in Realtime Database at the address above. Records stored only in Cloud Firestore need a separate adapter.</li><li>Confirm the transaction and alert paths match the configured source paths below.</li><li>Verify your email. Every verified account can read the workspace; if a read is still denied, ask your administrator to publish the current firebase/database.rules.json.</li><li>Run the connection check after correcting source configuration or account access. A successful empty read is different from a failed read.</li></ol><p class="helper">Default paths: ${Object.entries(DATA_PATHS).map(([key,path])=>`<code>${esc(key)}: /${esc(path)}</code>`).join(' · ')}. Environment variable names and example data are documented in the repository. No remote project or access rule has been changed.</p></section><section class="card mt-5" id="dataset-coverage"><h3>Dataset field coverage</h3><p class="helper">Known source column names are mapped automatically. Missing values are never invented. Model outputs and rule results must come from their pipelines, not a fraud label. Counts cover only the loaded sample; a missing optional model signal is not necessarily an error.</p><div id="field-coverage" class="mt-3">Run a connection check to inspect the loaded records.</div></section><div id="workspace-updates" class="mt-5"></div>`;
observeDataStatus(records=>{
  document.getElementById('source-checks').innerHTML=records.length?`<div class="table-wrap"><table class="workspace-table"><thead><tr><th>Source</th><th>State</th><th>Loaded</th><th>Last success</th><th>Detail</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(r.resource)}<small>/${esc(r.path||'')}</small></td><td><span class="badge badge-${({ready:'ok',empty:'info',error:'critical',loading:'medium'})[r.state]||'neutral'}">${esc(r.state)}</span></td><td>${r.count??'Not measured'}</td><td>${formatDateTime(r.lastSuccess)}</td><td>${r.state==='error'?`${(()=>{const d=dataErrorDetails({code:r.error},{path:r.path,user:auth.currentUser,operation:r.resource.includes('write')?'write':'read'});return `<strong>${esc(d.title)}</strong><p>${esc(d.message)}</p><a class="text-button" href="${esc(d.href)}">${esc(d.label)}</a><small>${esc(d.code)}</small>`;})()}`:r.state==='loading'?'Checking source access…':r.state==='empty'?'Read succeeded; this path has no records.':r.mode==='demo'?'Demo workspace records':'Authenticated source read'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="data-empty"><strong>No source checks yet</strong><p>Run a connection check to test each source.</p></div>';
});
onAuthStateChanged(auth,user=>{
  document.getElementById('session-status').textContent=DEMO_MODE?'Demo, no Firebase sign-in required':user?`Signed in${user.email?` as ${user.email}`:''}`:'Not signed in';
  document.getElementById('session-account-id').textContent=DEMO_MODE?'Demo account':user?.uid||'Not signed in';
  document.getElementById('connection-summary').textContent=DEMO_MODE?'Demo workspace: sample customers and rule alerts, kept in this browser. Sign in for Acurion K7 and dataset uploads.':user?(user.emailVerified?'You are signed in and your email is verified. The source checks below show whether your current rules allow access.':'You are signed in, but your email is not verified. Verify it before loading records.'):'Sign in to check access to your Firebase records.';
  const action=document.getElementById('session-action');
  action.href=DEMO_MODE?'index.html':user?(user.emailVerified?'transactions.html':'verify-email.html'):'login.html';
  action.textContent=DEMO_MODE?'Open demo workspace':user?(user.emailVerified?'View transactions':'Verify my email'):'Sign in or explore demo';
  action.hidden=false;
});
const button=document.getElementById('check-connection');
button.onclick=async()=>{button.disabled=true;button.textContent='Checking…';try{await checkDataConnection();
    const results=await Promise.allSettled([getTransactions(),getAlerts()]);
    document.getElementById('field-coverage').innerHTML=results.map((result,index)=>{
      const kind=index?'alerts':'transactions';
      if(result.status==='rejected')return `<p class="helper">${kind}: coverage unavailable because the source read failed.</p>`;
      const records=result.value,rows=fieldCoverage(records,kind);
      return `<details class="coverage-group" ${!index?'open':''}><summary>${records.length} loaded ${kind} · field availability</summary><div class="table-wrap"><table class="workspace-table"><thead><tr><th>Field</th><th>Present / loaded</th><th>Missing</th><th>Mapped source columns</th><th>Provided by</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.label)}</td><td>${row.present} / ${row.total}</td><td>${row.missing}</td><td>${esc(row.columns.join(', ')||'Canonical / derived record key, or unavailable')}</td><td>${esc(row.owner)}</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('');
  }finally{button.disabled=false;button.textContent=DEMO_MODE?'Refresh demo records':'Check connection';}};
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
}
renderServices();
watchHost(status=>{const changed=host?.connection!==status.connection||host?.k7.state!==status.k7.state||host?.uploads.state!==status.uploads.state;host=status;if(changed)renderServices();});
document.getElementById('reset-demo')?.addEventListener('click',async event=>{if(!confirm('Reset the demo workspace on this device? Cases, reviews and uploads made here will be deleted.'))return;event.currentTarget.disabled=true;await resetLocalWorkspace();location.reload();});
mountWorkspaceUpdates(document.getElementById('workspace-updates'));
