import '../styles/main.css';
import { revealRegion } from '../lib/motion.js';
import { renderLayout } from '../components/layout.js';
import { icon, escapeHTML as esc } from '../components/icons.js';
import { getAlerts, getTransactions, getTransactionById, saveAlertReview, clearDataCache, getMyRole, subscribeToUpdates } from '../lib/dataService.js';
import { compareAlertPriority } from '../lib/dataContracts.js';
import { createCaseFromAlert } from '../lib/caseWorkflow.js';
import { auth } from '../lib/firebase.js';
import { dataErrorDetails } from '../lib/dataStatus.js';
import { DEMO_MODE, SOURCE_LABEL } from '../lib/config.js';
import { formatDateTime, formatRisk, severityBadgeClass, decisionBadgeClass } from '../lib/utils.js';
import { renderLoadError, renderLoading } from '../components/dataFeedback.js';
import { contributionChart } from '../components/modelExplanation.js';
const main=renderLayout({active:'alerts.html',pageTitle:'Alerts',pageSubtitle:'Review risk signals, follow the evidence and record your decision'});
const featureLabels={currency:'Currency',windowMinutes:'Window in minutes',outgoingCount:'Outgoing transfers',incomingCount:'Incoming transfers',totalOutflow:'Total outflow',totalInflow:'Total inflow',maximumAmount:'Largest outgoing amount',uniqueCounterparties:'Distinct counterparties'};
const stages=[['','All alerts'],['open','Open'],['assigned','Assigned'],['investigating','Under review'],['escalated','Escalated'],['closed','Closed']];
main.innerHTML=`<nav class="workspace-tabs" aria-label="Alert stages">${stages.map(([value,label])=>`<button data-status="${value}" class="${!value?'selected':''}">${label}<span class="tab-count" data-stage-count="${value}">0</span></button>`).join('')}</nav><div class="filter-toolbar"><label class="search-field">${icon('search',18)}<input id="search" class="input" placeholder="Find alert, account or investigator" aria-label="Search alerts"></label><select id="severity-filter" class="input" aria-label="Alert severity"><option value="">All severities</option>${['critical','high','medium','low','unknown'].map(s=>`<option value="${s}">${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select><select id="source-filter" class="input" aria-label="Alert source"><option value="">All sources</option></select><select id="alert-sort" class="input" aria-label="Sort alerts"><option value="risk">Highest priority first</option><option value="time">Newest first</option></select><div class="view-switch" aria-label="Alert view"><button data-alert-view="list" class="selected">${icon('list',14)}List</button><button data-alert-view="board">${icon('board',14)}Board</button></div><button class="btn-ghost" id="reset-filters">Clear filters</button></div><p class="result-count" id="alert-count" role="status"></p><div id="alert-results"></div><dialog id="alert-dialog" class="detail-dialog" aria-label="Alert details"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close alert details">${icon('close')}</button></form><div id="detail-panel"></div></dialog>`;
let allAlerts=[],statusFilter=['open','assigned','investigating','escalated','closed'].includes(new URLSearchParams(location.search).get('stage'))?new URLSearchParams(location.search).get('stage'):'',view='list',selectedId;
const dialog=document.getElementById('alert-dialog'),panel=document.getElementById('detail-panel');
const STAGE_KEYS=['open','assigned','investigating','escalated','closed'];
const stage=status=>status==='resolved'?'closed':STAGE_KEYS.includes(status)?status:'open';
let loadFailed=false,role='viewer',sourceFilter=new URLSearchParams(location.search).get('source')||'';
// Which producer an alert came from: Acurion K7 live, an uploaded dataset, or the rules engine.
const sourceOf=a=>a.uploadId?a.uploadId:/\bK7\b/.test(a.modelVersion)?'k7':a.ruleScore!=null?'rules':'other';
const sourceName=(key,a)=>key==='k7'?'Acurion K7 live':key==='rules'?'Rules engine':key==='other'?'Other sources':(a?.sourceDataset||'Uploaded dataset');
// Alerts that arrived while this page was open are marked New until the page is reloaded.
const newIds=new Set();
function renderSourceOptions(){
  const select=document.getElementById('source-filter'),seen=new Map();
  for(const a of allAlerts){const key=sourceOf(a);if(!seen.has(key))seen.set(key,sourceName(key,a));}
  if(sourceFilter&&!seen.has(sourceFilter))seen.set(sourceFilter,sourceFilter==='k7'?'Acurion K7 live':'Selected upload');
  const order=key=>key==='k7'?0:key==='rules'?2:key==='other'?3:1;
  select.innerHTML=`<option value="">All sources</option>${[...seen].sort((a,b)=>order(a[0])-order(b[0])||a[1].localeCompare(b[1])).map(([key,label])=>`<option value="${esc(key)}" ${key===sourceFilter?'selected':''}>${esc(label)}</option>`).join('')}`;
  select.value=sourceFilter;
}
getMyRole().then(value=>{role=value;});
function renderRows() {
  if(loadFailed)return;
  const query=document.getElementById('search').value.toLowerCase(),severity=document.getElementById('severity-filter').value;
  const rows=allAlerts.filter(a=>(!statusFilter||stage(a.status)===statusFilter)&&(!severity||a.severity===severity)&&(!sourceFilter||sourceOf(a)===sourceFilter)&&(!query||`${a.id} ${a.suspiciousAccount} ${a.owner}`.toLowerCase().includes(query))).sort((a,b)=>document.getElementById('alert-sort').value==='risk'?compareAlertPriority(a,b):(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0));
  document.getElementById('alert-count').innerHTML=`Showing <strong>${rows.length}</strong> of ${allAlerts.length} loaded alerts <span>${SOURCE_LABEL}</span>`;
  document.querySelectorAll('[data-stage-count]').forEach(el=>{const value=el.dataset.stageCount;el.textContent=allAlerts.filter(a=>!value||stage(a.status)===value).length;});
  const result=document.getElementById('alert-results');
  if(!rows.length){result.innerHTML=`<div class="card data-empty"><strong>${allAlerts.length?'No alerts match your filters':'No alerts in this source yet'}</strong><p>${allAlerts.length?'Clear the filters to return to the full queue.':'New alerts appear here as soon as they are written to the alert path.'}</p><div class="action-row">${allAlerts.length?'<button class="btn-ghost" data-clear-filters>Clear filters</button>':'<a class="btn-ghost" href="system.html">Check data sources</a>'}</div></div>`;result.querySelector('[data-clear-filters]')?.addEventListener('click',()=>document.getElementById('reset-filters').click());return;}
  result.innerHTML=view==='board'?`<div class="board">${stages.slice(1).map(([value,label])=>`<section class="board-column"><div class="board-header">${label}<small>${rows.filter(a=>stage(a.status)===value).length}</small></div>${rows.filter(a=>stage(a.status)===value).map(a=>`<button class="board-card" data-alert-id="${esc(a.id)}"><p>${esc(a.id)}</p><small>${esc(a.suspiciousAccount)}</small><div class="card-meta"><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span><small>${formatRisk(a.riskScore)}</small></div><small>${esc(a.owner||'Unassigned')}</small></button>`).join('')||'<div class="board-empty">No alerts in this stage</div>'}</section>`).join('')}</div>`:`<div class="card !p-0 table-wrap"><table class="workspace-table"><thead><tr><th>Alert</th><th>Account</th><th>Severity</th><th>Score and recommendation</th><th>Stage</th><th>Time</th></tr></thead><tbody>${rows.map(a=>`<tr data-severity="${esc(a.severity)}" data-row-link${newIds.has(a.id)?' data-new':''}><td><button class="text-button font-mono row-primary" data-row-primary data-alert-id="${esc(a.id)}">${esc(a.id)}</button>${newIds.has(a.id)?'<span class="new-chip">New</span>':''}<small>${esc(a.sourceDataset||'Configured source')}</small></td><td class="font-mono"><span class="pii">${esc(a.suspiciousAccount)}</span></td><td><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></td><td><div class="score-cell"><strong>${a.ruleScore==null?formatRisk(a.riskScore):`${a.ruleScore}/100`}</strong><span class="${decisionBadgeClass(a.decision)}">${esc(a.decision)}</span></div><small>${a.ruleScore==null?'Model score':'Rule points'}</small></td><td><span class="stage-label" data-stage="${esc(stage(a.status))}">${esc((stages.find(([v])=>v===stage(a.status))||[,stage(a.status)])[1])}</span><small>${esc(a.owner||'Unassigned')}</small></td><td>${formatDateTime(a.timestamp)}</td></tr>`).join('')}</tbody></table></div>`;
  result.querySelectorAll('[data-alert-id]').forEach(button=>button.onclick=()=>renderDetail(allAlerts.find(a=>a.id===button.dataset.alertId)));
}
function renderDetail(alert) {
  if(!alert)return;selectedId=alert.id;
  const row=(label,value,tip='')=>value==null||value===''?'':`<div><dt>${label}${tip?` <button type="button" class="help-tip" aria-label="About ${esc(label.toLowerCase())}" data-tooltip="${esc(tip)}">?</button>`:''}</dt><dd>${value}</dd></div>`;
  const stageLabel=(stages.find(([v])=>v===stage(alert.status))||[,stage(alert.status)])[1];
  const ruleBased=alert.ruleScore!=null;
  panel.innerHTML=`<span class="section-kicker">Alert details</span><h2 class="font-mono" tabindex="-1" autofocus>${esc(alert.id)}</h2><div class="drawer-badges"><span class="${severityBadgeClass(alert.severity)}">${esc(alert.severity)}</span><span class="${decisionBadgeClass(alert.decision)}">${esc(alert.decision)}</span><span class="stage-label" data-stage="${esc(stage(alert.status))}">${esc(stageLabel)}</span></div><p class="helper">${esc(alert.sourceDataset||'Configured source')} · ${formatDateTime(alert.timestamp)}</p>
  <div class="record-links">${alert.transactionId?`<a class="btn-ghost" href="transactions.html?transaction=${encodeURIComponent(alert.transactionId)}">${icon('transactions',16)}View transaction</a>`:''}${alert.suspiciousAccount!=='Not supplied'?`<a class="btn-ghost" href="graph.html?account=${encodeURIComponent(alert.suspiciousAccount)}">${icon('graph',16)}Explore account</a>`:''}${alert.networkId?`<a class="btn-ghost" href="graph.html?network=${encodeURIComponent(alert.networkId)}">${icon('graph',16)}Open network</a>`:''}</div>
  <h3>${ruleBased?'Rule assessment':'Model assessment'}</h3><dl class="detail-list">
    ${ruleBased?row('Rule points',`${alert.ruleScore}/100`,'Points from the configured monitoring rules. They are separate from model scores and never added to them.'):row(sourceOf(alert)==='k7'?'K7 score':'Model score',formatRisk(alert.riskScore),'Score from 0 to 1 that ranks alerts for review. It is not a probability of laundering.')}
    ${row('Severity',`${esc(alert.severity)}${alert.severityBasis?` <small>${esc(alert.severityBasis)}</small>`:''}`)}
    ${row('Recommendation',`${esc(alert.decision)}${alert.decision==='block'?' <small>Recorded policy outcome; funds are not moved by this app</small>':''}`)}
    ${alert.reasons?.length?'':row('Reason',esc(alert.reason))}
    ${row('Model',esc(alert.modelVersion))}
    ${row('Policy',esc(alert.policyVersion))}
    ${row('Rules triggered',Array.isArray(alert.ruleIds)&&alert.ruleIds.length?esc(alert.ruleIds.join(', ')):'')}
    ${row('Scored at',alert.evaluatedAt?formatDateTime(alert.evaluatedAt):'')}
    ${row('History used',esc(alert.featureWindow||''))}
  </dl>
  ${alert.shapExplanation?.topFeatures?.length?`<h3>${sourceOf(alert)==='k7'?'Why K7 flagged this':'Why the model flagged this'}</h3>${contributionChart(alert.shapExplanation,{model:sourceOf(alert)==='k7'?'k7':'model'})}`:''}
  ${alert.reasons?.length&&!alert.shapExplanation?.topFeatures?.length?`<h3>Why the model flagged this</h3><ul class="reason-list">${alert.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p class="helper">Reasons from the model that scored ${esc(alert.sourceDataset||'this dataset')}, strongest first. They explain the score, not intent.</p>`:''}
  ${alert.ruleAssessment?.features ? `<h3>Observed account activity</h3><dl class="detail-list">${Object.entries(alert.ruleAssessment.features).map(([key,value]) => `<div><dt>${esc(featureLabels[key] || key)}</dt><dd>${esc(value ?? '–')}</dd></div>`).join('')}</dl><p class="helper">Features observed at the event time, in the configured currency and window.</p>` : ''}
  <p class="helper">Risk signals and shared relationships support review; they do not prove wrongdoing.</p><section class="review-form-panel"><h3>Record analyst review</h3><p class="helper">Your decision is saved with an audit entry. The model recommendation stays separate from your disposition. Choosing “Escalated to a case” opens an investigation case after saving.</p><form id="review-alert" class="form-grid"><label class="field">Investigator<input class="input" name="owner" value="${esc(alert.owner||'')}" placeholder="Investigator name"></label><label class="field">Review stage<select class="input" name="status">${stages.slice(1).map(([value,label])=>`<option value="${value}" ${stage(alert.status)===value?'selected':''} ${value==='closed'&&!['reviewer','admin'].includes(role)?'disabled':''}>${label}${value==='closed'&&!['reviewer','admin'].includes(role)?' (reviewer role)':''}</option>`).join('')}</select></label><label class="field full-width">Disposition<select class="input" name="disposition"><option value="">Review ongoing</option><option value="no_further_action" ${alert.disposition==='no_further_action'?'selected':''}>No further action</option><option value="escalated_to_case" ${alert.disposition==='escalated_to_case'?'selected':''}>Escalated to a case</option></select></label><label class="field full-width">Rationale / analyst note<textarea class="input" name="note" rows="3" minlength="10" required>${esc(alert.analystNote||'')}</textarea></label><button class="btn-primary" type="submit" data-tooltip="${DEMO_MODE?'Saves your decision and an audit entry in this workspace.':'Saves your decision and an audit entry together. Requires an analyst role on this workspace.'}">Save review</button></form><div id="review-result" role="status" class="helper"></div><button class="btn-ghost mt-3" id="create-case">${icon('cases',16)}Open investigation case</button><p class="helper">Creates a case with this alert, its transaction and related transfers as evidence, or opens the existing case for this alert.</p></section>`;
  if(!dialog.open)dialog.showModal();else panel.querySelector('h2')?.focus();
  document.getElementById('review-alert').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=event.submitter||form.querySelector('button[type=submit],button.btn-primary'),result=document.getElementById('review-result');button.disabled=true;
    try{const values=Object.fromEntries(new FormData(form)),saved=await saveAlertReview(alert,values);allAlerts=allAlerts.map(a=>a.id===saved.id?saved:a);renderRows();if(values.disposition==='escalated_to_case'){await openCase(saved,'Review saved. Opening the investigation case…');return;}renderDetail(saved);document.getElementById('review-result').textContent='Review saved with an audit event.';}
    catch(error){result.setAttribute('role','alert');if(error.code==='data/invalid-review'){result.textContent=error.message;}else{const detail=dataErrorDetails(error,{operation:'write',user:auth.currentUser});result.innerHTML=`<div class="review-error"><strong>${esc(detail.title)}</strong><p>${esc(detail.message)}</p><a class="text-button" href="${esc(detail.href)}">${esc(detail.label)}</a><small>Code: ${esc(detail.code)}</small></div>`;}}
    finally{if(button.isConnected)button.disabled=false;}
  };
  document.getElementById('create-case').onclick=()=>openCase(alert);
}
async function openCase(alert,message='') {
  const result=document.getElementById('review-result');
  try{if(message)result.textContent=message;const transactions=await getTransactions(),transaction=transactions.find(t=>t.id===alert.transactionId)||await getTransactionById(alert.transactionId),caseId=createCaseFromAlert(alert,transaction,transactions);location.href=`compliance.html?view=cases&case=${encodeURIComponent(caseId)}`;}
  catch(error){result.setAttribute('role','alert');result.textContent=error.message;}
}
async function init() {
  loadFailed=false;
  renderLoading(document.getElementById('alert-results'),'alerts');
  try{allAlerts=await getAlerts();renderSourceOptions();document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b.dataset.status===statusFilter));renderRows();const focus=new URLSearchParams(location.search).get('alert');if(focus){const record=allAlerts.find(a=>a.id===focus);if(record)renderDetail(record);else document.getElementById('alert-count').textContent='The referenced alert is outside the loaded sample or is unavailable.';}}
  catch(error){loadFailed=true;renderLoadError(document.getElementById('alert-results'),error,()=>{clearDataCache();init();});}
}
for(const id of ['search','severity-filter','alert-sort'])document.getElementById(id).addEventListener(id==='search'?'input':'change',renderRows);
document.getElementById('source-filter').addEventListener('change',event=>{sourceFilter=event.target.value;const url=new URL(location.href);if(sourceFilter)url.searchParams.set('source',sourceFilter);else url.searchParams.delete('source');history.replaceState(null,'',url);renderRows();});
// Live: new alerts (from K7 or an upload) and other investigators' reviews appear without a reload.
// An open alert keeps showing what the analyst is reading; the list behind it updates.
let pendingUpdate;
subscribeToUpdates('alerts',update=>{
  if(update.type!=='updated'||loadFailed)return;
  clearTimeout(pendingUpdate);
  pendingUpdate=setTimeout(()=>{
    const known=new Set(allAlerts.map(a=>a.id));
    for(const alert of update.items)if(!known.has(alert.id))newIds.add(alert.id);
    allAlerts=update.items;renderSourceOptions();renderRows();
  },400);
});
document.querySelectorAll('[data-status]').forEach(button=>button.onclick=()=>{statusFilter=button.dataset.status;document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b===button));renderRows();revealRegion(document.getElementById('alert-results'));});
document.querySelectorAll('[data-alert-view]').forEach(button=>button.onclick=()=>{view=button.dataset.alertView;document.querySelectorAll('[data-alert-view]').forEach(b=>b.classList.toggle('selected',b===button));renderRows();revealRegion(document.getElementById('alert-results'));});
document.getElementById('reset-filters').onclick=()=>{document.getElementById('search').value='';document.getElementById('severity-filter').value='';statusFilter='';sourceFilter='';document.getElementById('source-filter').value='';history.replaceState(null,'','alerts.html');document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b.dataset.status===''));renderRows();};
init();
