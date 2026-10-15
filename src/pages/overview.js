import '../styles/main.css';
import { renderLayout } from '../components/layout.js';
import { escapeHTML as esc, icon } from '../components/icons.js';
import { mountGatewayFlow } from '../islands/ambient.tsx';
import { getOverviewStats, getAlerts, getTransactions, getRiskTimeline, clearDataCache } from '../lib/dataService.js';
import { compareAlertPriority } from '../lib/dataContracts.js';
import { loadWorkspace } from '../lib/complianceStore.js';
import { customerRisk } from '../lib/amlEngine.js';
import { formatDateTime, formatRisk, severityBadgeClass } from '../lib/utils.js';
import { DEMO_MODE } from '../lib/config.js';
import { renderLoadError, renderLoading } from '../components/dataFeedback.js';
const main=renderLayout({active:'index.html',pageTitle:'Overview',pageSubtitle:'Prioritise your review work, then follow the evidence'});
main.innerHTML=`<section class="intelligence-banner compact-banner"><div class="banner-flow" id="overview-flow" aria-hidden="true"></div><div class="banner-copy"><span class="section-kicker">ANALYST DESK</span><h2>Start with the items that need review.</h2><p>${DEMO_MODE?'Fictional demo records.':'Configured source records.'} Cases and KYC are saved in this browser.</p></div><a class="btn-primary" href="alerts.html">Open alert queue →</a></section><div class="workflow-grid mb-5">${[['alerts.html','alerts','01','Review alerts','Prioritise and record a disposition'],['graph.html','graph','02','Follow the evidence','Inspect the transaction and account path'],['compliance.html?view=cases','cases','03','Build a case','Keep notes, evidence and a report draft']].map(([href,name,step,title,detail])=>`<a href="${href}" class="workflow-card"><span>${step} ${icon(name)}</span><strong>${title}</strong><small>${detail}</small></a>`).join('')}</div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5" id="stat-cards"></div><div class="workspace-columns mb-5"><section class="card"><div class="section-heading"><h3>Priority alerts</h3><a href="alerts.html" class="text-button">View all →</a></div><div id="priority-alerts"></div></section><section class="card"><h3>Due diligence to do</h3><p class="helper">Browser sandbox customer records</p><div id="review-tasks"></div></section></div><div id="transaction-activity" class="mb-5"></div><section class="card"><h3>Recorded risk over time</h3><p class="helper">Daily average of supplied scores in the loaded transaction sample. Missing scores and dates are excluded.</p><div id="risk-chart" class="risk-timeline"></div></section>`;
mountGatewayFlow(document.getElementById('overview-flow'),true);
async function region(id,loader,renderer) {
  const element=document.getElementById(id);renderLoading(element);
  try{renderer(element,await loader());}catch(error){renderLoadError(element,error,()=>{clearDataCache();region(id,loader,renderer);});}
}
region('stat-cards',getOverviewStats,(element,stats)=>{element.innerHTML=[['totalTransactions24h','Loaded transactions'],['totalAlerts','Loaded alerts'],['openAlerts','Alerts to review'],['blockedTransactions','Recorded block recommendations']].map(([key,label])=>`<div class="stat-card"><strong class="text-2xl font-mono">${stats[key].toLocaleString()}</strong><span>${label}</span></div>`).join('');});
region('priority-alerts',getAlerts,(element,alerts)=>{
  const pending=alerts.filter(a=>!['closed','resolved'].includes(a.status)).sort(compareAlertPriority).slice(0,5);
  element.innerHTML=pending.map(a=>`<a class="priority-row" href="alerts.html?alert=${encodeURIComponent(a.id)}"><div><strong>${esc(a.id)}</strong><small>${esc(a.suspiciousAccount)} · ${formatDateTime(a.timestamp)}</small></div><span class="badge ${severityBadgeClass(a.severity)}">${esc(a.severity)}</span><span>${a.ruleScore==null?formatRisk(a.riskScore):`${a.ruleScore} rule points`}</span>${icon('chevrons',12)}</a>`).join('')||'<div class="data-empty">No open alerts in the loaded records.</div>';
});
try{
  const state=loadWorkspace(),now=Date.now();
  const due=state.customers.filter(c=>!c.reviewedAt||Date.parse(c.reviewedAt)+state.policy.reviewDays*86400000<now);
  const pending=state.findings.filter(f=>f.disposition==='pending').length, high=state.customers.filter(c=>customerRisk(c,state.assessments,state.findings).score>=60).length;
  document.getElementById('review-tasks').innerHTML=[['compliance.html?view=customers',due.length,'KYC reviews due'],['compliance.html?view=screening',pending,'Screening matches to resolve'],['compliance.html?view=customers',high,'High risk profiles'],['compliance.html?view=cases',state.cases.filter(c=>c.status==='ready').length,'Cases ready for officer review']].map(([href,count,label])=>`<a class="task-row" href="${href}"><span>${label}</span><strong>${count}</strong></a>`).join('');
}catch(error){renderLoadError(document.getElementById('review-tasks'),error,()=>location.reload());}
region('risk-chart',getRiskTimeline,(element,days)=>{
  if(!days.length){element.innerHTML='<div class="data-empty">No dated model scores were supplied. A trend will appear when those fields are available.</div>';return;}
  const recent=days.slice(-20);
  element.innerHTML=`<div class="timeline-bars">${recent.map(d=>`<div class="timeline-day" title="${d.date}: ${formatRisk(d.avgRisk)} from ${d.count} records"><span>${formatRisk(d.avgRisk)}</span><div style="height:${Math.max(2,d.avgRisk*130)}px"></div><small>${d.date.slice(5)}</small></div>`).join('')}</div><p class="helper">${recent[0].date} to ${recent.at(-1).date} · ${days.length>20?'Showing the latest 20 recorded days.':''} Scores describe risk signals, not proof of wrongdoing.</p>`;
});

// Reuse the bounded transaction read; the canvas code is loaded separately from the shell.
let disposeActivity;
async function loadActivity(){
  const element=document.getElementById('transaction-activity');renderLoading(element,'transaction activity');
  try{const [transactions,{mountTransactionSkyline}]=await Promise.all([getTransactions(),import('../islands/transaction-skyline.tsx')]);disposeActivity?.();disposeActivity=mountTransactionSkyline(element,transactions,DEMO_MODE);}
  catch(error){renderLoadError(element,error,()=>{clearDataCache();loadActivity();});}
}
loadActivity();
