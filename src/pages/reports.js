import '../styles/main.css';
import { transitionView } from '../lib/motion.js';
import { renderLayout } from '../components/layout.js';
import { escapeHTML as esc } from '../components/icons.js';
import { mountDraftTray } from '../islands/draft-tray.tsx';
import { getAuditLogs,clearDataCache } from '../lib/dataService.js';
import { loadWorkspace,saveWorkspace,downloadJSON } from '../lib/complianceStore.js';
import { DEMO_MODE, DATA_PATHS } from '../lib/config.js';
import { buildCaseReport } from '../lib/caseWorkflow.js';
import { formatDateTime } from '../lib/utils.js';
import { renderLoading,renderLoadError } from '../components/dataFeedback.js';
const main=renderLayout({active:'reports.html',pageTitle:'Reports & audit',pageSubtitle:'Export an investigation from its evidence and inspect recorded activity'});
main.innerHTML=`<nav class="workspace-tabs" aria-label="Report sections"><a class="selected" href="#cases" data-report-view="cases">Case reports</a><a href="#audit" data-report-view="audit">Audit activity</a><a href="#draft-tray" data-report-view="draft-tray">Working drafts</a></nav><section id="cases"><div class="section-heading"><div><h3>Investigation reports</h3><p class="helper">Browser sandbox drafts. Complete the owner, jurisdiction, narrative and grounds in the case before export.</p></div><a class="btn-ghost" href="compliance.html?view=cases">Open cases →</a></div><div id="case-reports"></div><p class="helper" id="export-message" role="status"></p></section><section id="audit" hidden><div class="section-heading"><div><h3>Audit activity</h3><p class="helper">Source events and browser sandbox actions are labelled separately. Browser logs are not immutable.</p></div><button class="btn-ghost" id="export-audit" data-tooltip="Exports only the audit rows loaded in this view. Browser sandbox events are labelled separately from Firebase events." disabled>Export loaded CSV</button></div><div id="audit-results"></div></section><section id="draft-tray" hidden></section>`;
mountDraftTray(document.getElementById('draft-tray'));
let allLogs=[];
function renderCases(){
  try{const state=loadWorkspace();document.getElementById('case-reports').innerHTML=state.cases.length?`<div class="card !p-0 table-wrap"><table class="workspace-table"><thead><tr><th>Case</th><th>Owner</th><th>Stage</th><th>Evidence</th><th>Report</th><th>Actions</th></tr></thead><tbody>${state.cases.map(c=>`<tr><td>${esc(c.id)}<small>${esc(c.customerId)}</small></td><td>${esc(c.owner||'Unassigned')}</td><td>${esc(c.status.replaceAll('_',' '))}</td><td>${c.transactionIds.length} transactions · ${c.graphEvidence?.length||0} graph captures</td><td>${esc(c.reportType)}</td><td><a class="text-button" href="compliance.html?view=cases&case=${encodeURIComponent(c.id)}">Open case</a> <button class="btn-ghost" data-export-case="${esc(c.id)}">Export draft</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="card data-empty"><strong>No case reports yet</strong><p>Review an alert or run a monitoring scenario, open a case, and record your investigation.</p><a class="btn-primary" href="alerts.html">Review alerts →</a></div>';
    main.querySelectorAll('[data-export-case]').forEach(button=>button.onclick=()=>{try{const latest=loadWorkspace(),record=latest.cases.find(c=>c.id===button.dataset.exportCase),report=buildCaseReport(latest,record);saveWorkspace(latest,'Report draft exported',record.id);downloadJSON(`${record.id}-draft.json`,report);document.getElementById('export-message').textContent='Draft exported with source references, graph evidence, notes and activity. No regulatory submission was performed.';}catch(error){document.getElementById('export-message').textContent=error.message;}});
  }catch(error){renderLoadError(document.getElementById('case-reports'),error,renderCases);}
}
async function renderAudit(){
  const result=document.getElementById('audit-results');document.getElementById('export-audit').disabled=true;allLogs=[];renderLoading(result,'audit activity');
  let sandbox=[];
  try{sandbox=loadWorkspace().audit.map(a=>({id:a.id,timestamp:a.at,action:a.action,actor:a.actor,detail:a.detail,source:'Browser sandbox'}));}catch{}
  try{const logs=await getAuditLogs();allLogs=[...logs.map(l=>({...l,source:DEMO_MODE?'Demo transaction source':'Firebase transaction source'})),...sandbox].sort((a,b)=>(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0));}
  catch(error){allLogs=sandbox;renderLoadError(result,error,()=>{clearDataCache();renderAudit();},{path:DATA_PATHS.audit});if(!sandbox.length)return;result.insertAdjacentHTML('beforeend','<p class="helper">Browser sandbox activity remains available below.</p>');}
  const table=`<div class="card !p-0 table-wrap"><table class="workspace-table"><thead><tr><th>Time</th><th>Source</th><th>Action</th><th>Reference / detail</th><th>Actor</th></tr></thead><tbody>${allLogs.map(l=>`<tr><td>${formatDateTime(l.timestamp)}</td><td>${esc(l.source)}</td><td>${esc(l.action)}</td><td>${esc(l.alertId||l.transactionId||'')}<small>${esc(l.detail||'')}</small></td><td>${esc(l.actor)}</td></tr>`).join('')}</tbody></table></div>`;
  if(result.querySelector('[role="alert"]'))result.insertAdjacentHTML('beforeend',table);else result.innerHTML=allLogs.length?table:'<div class="card data-empty">Connection succeeded. No audit events have been recorded at this source yet. Viewing an alert does not create an audit event; a successful review save does.</div>';
  document.getElementById('export-audit').disabled=!allLogs.length;
}
function showView(){const view=['cases','audit','draft-tray'].includes(location.hash.slice(1))?location.hash.slice(1):'cases';for(const id of ['cases','audit','draft-tray'])document.getElementById(id).hidden=id!==view;main.querySelectorAll('[data-report-view]').forEach(link=>{link.classList.toggle('selected',link.dataset.reportView===view);link.setAttribute('aria-current',link.dataset.reportView===view?'page':'false');});if(view==='audit')renderAudit();}
document.getElementById('export-audit').onclick=()=>{const rows=[['Time','Source','Action','Alert','Transaction','Detail','Actor'],...allLogs.map(l=>[l.timestamp,l.source,l.action,l.alertId,l.transactionId,l.detail,l.actor])];const csv=rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),link=document.createElement('a');link.href=url;link.download='acurion-audit-sample.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);try{saveWorkspace(loadWorkspace(),'Audit sample exported',`${allLogs.length} loaded rows`);}catch{document.getElementById('export-message').textContent='CSV downloaded, but the browser export log could not be saved.';}};
main.querySelectorAll('[data-report-view]').forEach(link => link.onclick = event => { event.preventDefault(); if(location.hash===link.hash)return; transitionView(() => { history.pushState(null,'',link.hash); showView(); }).catch(() => showView()); });
window.addEventListener('hashchange',() => transitionView(showView));
window.addEventListener('popstate',() => transitionView(showView));
renderCases();showView();
