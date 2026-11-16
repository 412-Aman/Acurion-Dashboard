import '../styles/main.css';
import { revealRegion } from '../lib/motion.js';
import { renderLayout } from '../components/layout.js';
import { icon, escapeHTML as esc } from '../components/icons.js';
import { getAlerts, getTransactions, getTransactionById, saveAlertReview, clearDataCache, getMyRole, subscribeToUpdates } from '../lib/dataService.js';
import { compareAlertPriority } from '../lib/dataContracts.js';
import { createCaseFromAlert } from '../lib/caseWorkflow.js';
import { auth } from '../lib/firebase.js';
import { dataErrorDetails } from '../lib/dataStatus.js';
import { notify } from '../lib/notify.js';
import { DEMO_MODE } from '../lib/config.js';
import { formatDateTime, formatRisk, formatCurrency, severityBadgeClass } from '../lib/utils.js';
import { renderLoadError, renderLoading } from '../components/dataFeedback.js';
import { contributionChart, contributionNote } from '../components/modelExplanation.js';
import { riskMeter, riskText, reasonChipList, sourceChip } from '../components/visuals.js';
import { infoButton } from '../components/infoPop.js';
import { bump } from '../lib/countUp.js';
const main=renderLayout({active:'alerts.html',pageTitle:'Alerts',pageSubtitle:'Open an alert, check why it was flagged, record your decision'});
const featureLabels={currency:'Currency',windowMinutes:'Window in minutes',outgoingCount:'Outgoing transfers',incomingCount:'Incoming transfers',totalOutflow:'Total outflow',totalInflow:'Total inflow',maximumAmount:'Largest outgoing amount',uniqueCounterparties:'Distinct counterparties'};
const stages=[['','All alerts'],['open','Open'],['assigned','Assigned'],['investigating','Under review'],['escalated','Escalated'],['closed','Closed']];
main.innerHTML=`<nav class="workspace-tabs" aria-label="Alert stages">${stages.map(([value,label])=>`<button data-status="${value}" class="${!value?'selected':''}">${label}<span class="tab-count" data-stage-count="${value}">0</span></button>`).join('')}</nav><div class="filter-toolbar"><label class="search-field">${icon('search',18)}<input id="search" class="input" placeholder="Find alert, account or investigator" aria-label="Search alerts"></label><button type="button" class="btn-ghost filter-toggle" aria-expanded="false" aria-controls="alert-filters">${icon('controls',16)}Filters</button><div class="filter-more" id="alert-filters"><select id="severity-filter" class="input" aria-label="Alert severity"><option value="">All severities</option>${['critical','high','medium','low','unknown'].map(s=>`<option value="${s}">${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select><select id="source-filter" class="input" aria-label="Alert source"><option value="">All sources</option></select><select id="alert-sort" class="input" aria-label="Sort alerts"><option value="risk">Highest priority first</option><option value="time">Newest first</option></select><div class="view-switch" aria-label="Alert view"><button data-alert-view="list" class="selected">${icon('list',14)}List</button><button data-alert-view="board">${icon('board',14)}Board</button></div><button class="btn-ghost" id="reset-filters">Clear filters</button></div></div><p class="result-count" id="alert-count" role="status"></p><div id="alert-results"></div><dialog id="alert-dialog" class="detail-dialog" aria-label="Alert details"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close alert details">${icon('close')}</button></form><div id="detail-panel"></div></dialog>`;
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
  document.getElementById('alert-count').innerHTML=`Showing <strong>${rows.length}</strong> of ${allAlerts.length} alerts`;
  document.querySelectorAll('[data-stage-count]').forEach(el=>{const value=el.dataset.stageCount,next=String(allAlerts.filter(a=>!value||stage(a.status)===value).length);if(el.textContent!==next){if(el.dataset.ready)bump(el);el.textContent=next;}el.dataset.ready='1';});
  const result=document.getElementById('alert-results');
  if(!rows.length){result.innerHTML=`<div class="card data-empty"><strong>${allAlerts.length?'No alerts match your filters':'No alerts in this source yet'}</strong><p>${allAlerts.length?'Clear the filters to return to the full queue.':'New alerts appear here as soon as they are written to the alert path.'}</p><div class="action-row">${allAlerts.length?'<button class="btn-ghost" data-clear-filters>Clear filters</button>':'<a class="btn-ghost" href="system.html">Check data sources</a>'}</div></div>`;result.querySelector('[data-clear-filters]')?.addEventListener('click',()=>document.getElementById('reset-filters').click());return;}
  result.innerHTML=view==='board'?`<div class="board">${stages.slice(1).map(([value,label])=>`<section class="board-column"><div class="board-header">${label}<small>${rows.filter(a=>stage(a.status)===value).length}</small></div>${rows.filter(a=>stage(a.status)===value).map(a=>`<button class="board-card" data-alert-id="${esc(a.id)}"><p>${esc(a.id)}</p><small>${esc(a.suspiciousAccount)}</small><div class="card-meta"><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span>${riskMeter(a)}</div><small>${esc(a.owner||'Unassigned')}</small></button>`).join('')||'<div class="board-empty">No alerts in this stage</div>'}</section>`).join('')}</div>`:`<div class="card !p-0 table-wrap"><table class="workspace-table alerts-table"><thead><tr><th>Alert</th><th>Account</th><th>Risk</th><th>Stage</th><th>Time</th></tr></thead><tbody>${rows.map(a=>`<tr data-severity="${esc(a.severity)}" data-row-link${newIds.has(a.id)?' data-new':''}><td><button class="text-button font-mono row-primary" data-row-primary data-alert-id="${esc(a.id)}">${esc(a.id)}</button>${newIds.has(a.id)?'<span class="new-chip">New</span>':''}<small>${sourceChip(a)}</small></td><td class="font-mono"><span class="pii">${esc(a.suspiciousAccount)}</span></td><td><div class="risk-cell">${riskMeter(a)}<span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></div></td><td><span class="stage-label" data-stage="${esc(stage(a.status))}">${esc((stages.find(([v])=>v===stage(a.status))||[,stage(a.status)])[1])}</span><small>${esc(a.owner||'Unassigned')}</small></td><td>${formatDateTime(a.timestamp)}</td></tr>`).join('')}</tbody></table></div>`;
  result.querySelectorAll('[data-alert-id]').forEach(button=>button.onclick=()=>renderDetail(allAlerts.find(a=>a.id===button.dataset.alertId)));
}
// The signed-in investigator's name, offered as the owner so a review needs no typing beyond the note.
const myName=()=>DEMO_MODE?'Demo analyst':(auth.currentUser?.displayName||auth.currentUser?.email?.split('@')[0]||'');
// What the investigator decides, in plain words, and the review stage and disposition it records.
const DECISIONS={
  review:{status:'investigating',disposition:'',title:'Reviewing',detail:'Keep it open while you check',icon:'eye',save:'Save review'},
  escalate:{status:'escalated',disposition:'escalated_to_case',title:'Escalate',detail:'Open a case for it',icon:'cases',save:'Escalate and open a case'},
  close:{status:'closed',disposition:'no_further_action',title:'Close',detail:'Nothing suspicious found',icon:'shield',save:'Close alert'},
  reopen:{status:'open',disposition:'',title:'Reopen',detail:'Put it back in the queue',icon:'alerts',save:'Reopen alert'},
};
const decisionOf=alert=>stage(alert.status)==='escalated'||alert.disposition==='escalated_to_case'?'escalate':stage(alert.status)==='closed'?'close':'review';
function renderDetail(alert) {
  if(!alert)return;selectedId=alert.id;
  const fact=(label,value,tip='')=>value==null||value===''?'':`<div><dt>${label}</dt><dd>${value}${tip?`<small>${esc(tip)}</small>`:''}</dd></div>`;
  const stageLabel=(stages.find(([v])=>v===stage(alert.status))||[,stage(alert.status)])[1];
  const ruleBased=alert.ruleScore!=null,kind=sourceOf(alert),features=alert.ruleAssessment?.features;
  const verdict={block:'Block recommended',flag:'Flag for review',pass:'No action recommended'}[alert.decision]||'No recommendation given';
  const money=value=>value==null||!Number.isFinite(Number(value))?'–':formatCurrency(Number(value),features?.currency||null);
  const facts=features?[[`Sent in ${features.windowMinutes||'–'} min`,money(features.totalOutflow)],['Transfers',`${features.outgoingCount??0} out · ${features.incomingCount??0} in`],['Counterparties',features.uniqueCounterparties??'–']]:[];
  const technical=`<dl class="info-facts">${[
    fact(ruleBased?'Rule points':kind==='k7'?'K7 score':'Model score',ruleBased?`${alert.ruleScore}/100`:formatRisk(alert.riskScore),ruleBased?'From the monitoring rules; never added to model scores.':'Ranks alerts for review; not a probability of laundering.'),
    fact('Severity',`${esc(alert.severity)}${alert.severityBasis?` (${esc(alert.severityBasis)})`:''}`),
    fact('Recommendation',`${esc(alert.decision)}${alert.decision==='block'?' (a recorded policy outcome; this app never moves funds)':''}`),
    fact('Source',esc(alert.sourceDataset||'Configured source')),fact('Model',esc(alert.modelVersion)),fact('Policy',esc(alert.policyVersion)),
    fact('Rules triggered',Array.isArray(alert.ruleIds)&&alert.ruleIds.length?esc(alert.ruleIds.join(', ')):''),
    fact('Rule wording',alert.ruleAssessment?.reasons?.length?alert.ruleAssessment.reasons.map(r=>`${esc(r.message)} (+${esc(r.points)})`).join('<br>'):''),
    fact('Scored at',alert.evaluatedAt?formatDateTime(alert.evaluatedAt):''),fact('History used',esc(alert.featureWindow||'')),
    ...(features?Object.entries(features).map(([key,value])=>fact(esc(featureLabels[key]||key),esc(value??'–'))):[]),
  ].join('')}</dl>${alert.shapExplanation?.topFeatures?.length?`<p>${esc(contributionNote(alert.shapExplanation,kind==='k7'?'k7':'model'))}</p>`:''}<p>Risk signals and shared relationships support a review. They do not prove wrongdoing.</p>`;
  // A model's reasons come with their weights as bars; the chips are for rule reasons and plain sentences.
  const chart=alert.shapExplanation?.topFeatures?.length?contributionChart(alert.shapExplanation,{model:kind==='k7'?'k7':'model',note:false}):'',chips=chart?'':reasonChipList(alert);
  const canClose=['reviewer','admin'].includes(role),current=decisionOf(alert),closed=stage(alert.status)==='closed';
  const choices=(closed?['reopen','escalate']:['review','escalate','close']);
  const chosen=choices.includes(current)?current:choices[0];
  panel.innerHTML=`<header class="alert-head"><span class="section-kicker">Alert</span><h2 class="font-mono" tabindex="-1" autofocus>${esc(alert.id)}</h2><div class="drawer-badges"><span class="${severityBadgeClass(alert.severity)}">${esc(alert.severity)}</span><span class="stage-label" data-stage="${esc(stage(alert.status))}">${esc(stageLabel)}</span>${sourceChip(alert)}</div><p class="alert-meta"><span class="pii">${esc(alert.suspiciousAccount)}</span> · ${formatDateTime(alert.timestamp)}</p></header>
  <section class="alert-gauge" data-tone="${esc(alert.severity)}"><div class="alert-gauge-top"><span>${ruleBased?'Risk points':kind==='k7'?'K7 score':'Risk score'}</span><strong>${esc(riskText(alert))}${ruleBased?'<small>/100</small>':''}</strong></div>${riskMeter(alert,{size:'lg'})}<p class="alert-verdict" data-decision="${esc(alert.decision)}">${esc(verdict)}</p></section>
  ${chips||chart?`<section class="alert-why"><div class="alert-why-head"><h3>Why it was flagged</h3>${infoButton(technical,{title:'Technical details'})}</div>${chips}${chart}</section>`:`<div class="alert-why-head">${infoButton(technical,{title:'Technical details'})}</div>`}
  ${facts.length?`<dl class="alert-facts">${facts.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
  <div class="record-links">${alert.transactionId?`<a class="btn-ghost" href="transactions.html?transaction=${encodeURIComponent(alert.transactionId)}&from=${encodeURIComponent(alert.firebaseKey||'')}">${icon('transactions',16)}Payment</a>`:''}${alert.suspiciousAccount!=='Not supplied'?`<a class="btn-ghost" href="graph.html?account=${encodeURIComponent(alert.suspiciousAccount)}">${icon('graph',16)}Account map</a>`:''}${alert.networkId?`<a class="btn-ghost" href="graph.html?network=${encodeURIComponent(alert.networkId)}">${icon('graph',16)}Network</a>`:''}${role==='viewer'?'':`<button type="button" class="btn-ghost" id="create-case">${icon('cases',16)}Case</button>`}</div>
  ${role==='viewer'?`<section class="review-form-panel review-readonly"><h3>Your decision</h3><p>Your account is read-only. Ask an admin for the analyst role to record decisions.</p>${alert.analystNote?`<p class="review-last"><strong>${esc(stageLabel)}</strong>${alert.owner?` · ${esc(alert.owner)}`:''}<br>${esc(alert.analystNote)}</p>`:''}</section>`:''}
  <section class="review-form-panel"${role==='viewer'?' hidden':''}><form id="review-alert" class="review-form" novalidate>
    <fieldset class="decision-cards"><legend>Your decision</legend>${choices.map(key=>{const d=DECISIONS[key],locked=key==='close'&&!canClose;return `<label class="decision-card" data-decision="${key}"${locked?' data-locked':''}><input type="radio" name="decision" value="${key}" ${key===chosen&&!locked?'checked':''} ${locked?'disabled':''}><span class="decision-icon">${icon(d.icon,18)}</span><strong>${d.title}</strong><small>${locked?'Reviewers and admins close alerts':d.detail}</small></label>`;}).join('')}</fieldset>
    <label class="field review-note"><span>Note</span><textarea class="input" name="note" rows="3" minlength="10" required placeholder="What did you check, and why this decision?">${esc(alert.analystNote||'')}</textarea><small data-note-count></small></label>
    <div class="review-foot"><label class="review-owner">Investigator<input class="input" name="owner" value="${esc(alert.owner||myName())}" placeholder="Your name" autocomplete="name"></label><button class="btn-primary" type="submit">${DECISIONS[chosen].save}</button></div>
    <div id="review-result" role="status" class="helper"></div>
  </form></section>`;
  if(!dialog.open)dialog.showModal();else panel.querySelector('h2')?.focus();
  const form=document.getElementById('review-alert'),note=form.elements.note,count=form.querySelector('[data-note-count]'),submit=form.querySelector('button[type=submit]');
  const showCount=()=>{const left=10-note.value.trim().length;count.textContent=left>0?`${left} more character${left===1?'':'s'} needed`:'';};
  note.addEventListener('input',showCount);showCount();
  form.addEventListener('change',event=>{if(event.target.name==='decision')submit.textContent=DECISIONS[event.target.value].save;});
  form.onsubmit=async event=>{
    event.preventDefault();const result=document.getElementById('review-result');result.textContent='';
    const picked=DECISIONS[form.elements.decision.value]||DECISIONS.review;
    const values={owner:form.elements.owner.value,note:note.value,status:picked.status,disposition:picked.disposition};
    submit.disabled=true;
    try{const saved=await saveAlertReview(alert,values);allAlerts=allAlerts.map(a=>a.id===saved.id?saved:a);renderRows();if(values.disposition==='escalated_to_case'){await openCase(saved,'Review saved. Opening the investigation case…');return;}renderDetail(saved);notify({tone:'ok',title:picked===DECISIONS.close?'Alert closed':picked===DECISIONS.reopen?'Alert reopened':'Review saved',detail:`${saved.id} · ${(stages.find(([value])=>value===stage(saved.status))||[,saved.status])[1]}`,note:'Recorded in the audit trail.'});}
    catch(error){result.setAttribute('role','alert');if(error.code==='data/invalid-review'){result.textContent=error.message;notify({tone:'warn',title:'Review not saved yet',detail:error.message});(note.value.trim().length<10?note:form.elements.owner).focus();}else{const detail=dataErrorDetails(error,{operation:'write',user:auth.currentUser});notify({tone:'warn',title:detail.title,detail:'The reason is under the form.'});result.innerHTML=`<div class="review-error"><strong>${esc(detail.title)}</strong><p>${esc(detail.message)}</p><a class="text-button" href="${esc(detail.href)}">${esc(detail.label)}</a><small>Code: ${esc(detail.code)}</small></div>`;}}
    finally{if(submit.isConnected)submit.disabled=false;}
  };
  document.getElementById('create-case')?.addEventListener('click',()=>openCase(alert));
}
async function openCase(alert,message='') {
  const result=document.getElementById('review-result');
  try{if(message)result.textContent=message;const transactions=await getTransactions(),transaction=transactions.find(t=>t.id===alert.transactionId)||await getTransactionById(alert.transactionId,{alertKey:alert.firebaseKey}),caseId=createCaseFromAlert(alert,transaction,transactions);notify({tone:'ok',title:message?'Review saved, case opened':'Case opened',detail:`${caseId} · from ${alert.id}`,note:'The alert, its payment and related transfers are attached.'},{next:true});location.href=`compliance.html?view=cases&case=${encodeURIComponent(caseId)}`;}
  catch(error){result.setAttribute('role','alert');result.textContent=error.message;notify({tone:'warn',title:'Case not opened',detail:error.message});}
}
async function init() {
  loadFailed=false;
  renderLoading(document.getElementById('alert-results'),'alerts');
  try{[allAlerts,role]=await Promise.all([getAlerts(),getMyRole()]);renderSourceOptions();document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b.dataset.status===statusFilter));renderRows();const focus=new URLSearchParams(location.search).get('alert');if(focus){const record=allAlerts.find(a=>a.id===focus);if(record)renderDetail(record);else document.getElementById('alert-count').textContent='The referenced alert is outside the loaded sample or is unavailable.';}}
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
// Phones: the filters fold behind one button so the alerts come first.
document.querySelector('.filter-toggle').onclick=event=>{const open=event.currentTarget.getAttribute('aria-expanded')!=='true';event.currentTarget.setAttribute('aria-expanded',String(open));document.getElementById('alert-filters').classList.toggle('is-open',open);};
document.getElementById('reset-filters').onclick=()=>{document.getElementById('search').value='';document.getElementById('severity-filter').value='';statusFilter='';sourceFilter='';document.getElementById('source-filter').value='';history.replaceState(null,'','alerts.html');document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b.dataset.status===''));renderRows();};
init();
