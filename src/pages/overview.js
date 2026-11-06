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
main.innerHTML=`<section class="hero-card"><div class="hero-flow" id="overview-flow" aria-hidden="true"></div><div class="hero-copy"><span class="section-kicker">Analyst desk</span><h2>Start with the items that need review.</h2><p>${DEMO_MODE?'You are exploring fictional demo records.':'You are viewing records from the configured source.'} Cases and KYC profiles are saved in this browser.</p><div class="action-row"><a class="btn-primary" href="alerts.html">${icon('alerts',16)}Open alert queue</a><a class="btn-ghost" href="compliance.html?view=cases">${icon('cases',16)}Go to cases</a></div></div></section>
<section class="page-section" aria-labelledby="workflow-title"><div class="page-section-heading"><div><h2 id="workflow-title">How a review works</h2><p>Three steps take an alert from first signal to a documented decision.</p></div></div><ol class="workflow-grid">${[['alerts.html','alerts','1','Review alerts','Sort the queue by priority, open an alert and record your disposition.',''],['graph.html','graph','2','Follow the evidence','Trace the transaction and the accounts it touches to see the wider pattern.','info'],['compliance.html?view=cases','cases','3','Build a case','Keep notes, attach evidence and prepare a report draft for review.','violet']].map(([href,name,step,title,detail,tone])=>`<li><a href="${href}" class="workflow-card"><span class="workflow-step">Step ${step}</span><span class="icon-chip ${tone}">${icon(name,20)}</span><strong>${title}</strong><small>${detail}</small><span class="workflow-go">Open ${icon('arrow',16)}</span></a></li>`).join('')}</ol></section>
<section class="page-section" aria-labelledby="numbers-title"><div class="page-section-heading"><div><h2 id="numbers-title">At a glance</h2><p>Counts describe the loaded sample, not every record at the source.</p></div></div><div class="stat-tiles" id="stat-cards"></div></section>
<div class="overview-columns"><section class="card"><div class="section-heading"><div><h3>Priority alerts</h3><p class="helper">Open alerts, highest priority first.</p></div><a href="alerts.html" class="btn-ghost">View all</a></div><div id="priority-alerts"></div></section><section class="card"><div class="section-heading"><div><h3>Due diligence to do</h3><p class="helper">Work waiting in the browser sandbox.</p></div><a href="compliance.html?view=customers" class="btn-ghost">Customers</a></div><div id="review-tasks"></div></section></div>
<div id="transaction-activity" class="page-section"></div>
<section class="card page-section"><div class="section-heading"><div><h3>Recorded risk over time</h3><p class="helper">Daily average of the risk scores supplied with the loaded transactions. Records without a score or date are left out.</p></div><div class="chart-legend" aria-hidden="true"><span><i class="tone-ok"></i>Below 35</span><span><i class="tone-warn"></i>35 to 60</span><span><i class="tone-crit"></i>Above 60</span></div></div><div id="risk-chart" class="risk-timeline"></div></section>`;
mountGatewayFlow(document.getElementById('overview-flow'),true);
async function region(id,loader,renderer) {
  const element=document.getElementById(id);renderLoading(element);
  try{renderer(element,await loader());}catch(error){renderLoadError(element,error,()=>{clearDataCache();region(id,loader,renderer);});}
}
region('stat-cards',getOverviewStats,(element,stats)=>{element.innerHTML=[['totalTransactions24h','Loaded transactions','transactions','','Records in the current sample'],['totalAlerts','Loaded alerts','alerts','info','Rule and model alerts in the sample'],['openAlerts','Alerts to review','eye','warn','Not yet closed or resolved'],['blockedTransactions','Block recommendations','shield','crit','Recorded policy outcomes. No funds are blocked here.']].map(([key,label,name,tone,note])=>`<div class="stat-tile" style="--tile-color:var(--color-${({info:'info',warn:'warn',crit:'crit'})[tone]||'accent'})"><div class="stat-tile-top"><span class="stat-tile-label">${label}</span><span class="icon-chip ${tone}">${icon(name,18)}</span></div><strong class="stat-tile-value">${stats[key].toLocaleString()}</strong><span class="stat-tile-note">${note}</span></div>`).join('');});
region('priority-alerts',getAlerts,(element,alerts)=>{
  const pending=alerts.filter(a=>!['closed','resolved'].includes(a.status)).sort(compareAlertPriority).slice(0,5);
  element.innerHTML=pending.length?`<div class="priority-list">${pending.map(a=>`<a class="priority-row" data-severity="${esc(a.severity)}" href="alerts.html?alert=${encodeURIComponent(a.id)}"><div><strong>${esc(a.id)}</strong><small>${esc(a.suspiciousAccount)} · ${formatDateTime(a.timestamp)}</small></div><span class="priority-score">${a.ruleScore==null?formatRisk(a.riskScore):`${a.ruleScore} rule pts`}</span><span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></a>`).join('')}</div>`:'<div class="data-empty"><strong>Queue is clear</strong><p>No open alerts in the loaded records.</p></div>';
});
try{
  const state=loadWorkspace(),now=Date.now();
  const due=state.customers.filter(c=>!c.reviewedAt||Date.parse(c.reviewedAt)+state.policy.reviewDays*86400000<now);
  const pending=state.findings.filter(f=>f.disposition==='pending').length, high=state.customers.filter(c=>customerRisk(c,state.assessments,state.findings).score>=60).length;
  document.getElementById('review-tasks').innerHTML=[['compliance.html?view=customers',due.length,'KYC reviews due'],['compliance.html?view=screening',pending,'Screening matches to resolve'],['compliance.html?view=customers',high,'High risk profiles'],['compliance.html?view=cases',state.cases.filter(c=>c.status==='ready').length,'Cases ready for officer review']].map(([href,count,label])=>`<a class="task-row" href="${href}" data-has-items="${count>0}"><span>${label}</span><strong>${count}</strong></a>`).join('');
}catch(error){renderLoadError(document.getElementById('review-tasks'),error,()=>location.reload());}
region('risk-chart',getRiskTimeline,(element,days)=>{
  if(!days.length){element.innerHTML='<div class="data-empty">No dated model scores were supplied. A trend will appear when those fields are available.</div>';return;}
  const recent=days.slice(-20);
  const tone=v=>v>.6?'crit':v>.35?'warn':'ok';
  element.innerHTML=`<div class="timeline-bars" role="list">${recent.map(d=>`<div class="timeline-day" role="listitem" title="${d.date}: ${formatRisk(d.avgRisk)} from ${d.count} records"><span>${Math.round(d.avgRisk*100)}</span><div class="timeline-track"><div class="timeline-bar tone-${tone(d.avgRisk)}" style="height:${Math.max(3,Math.min(1,d.avgRisk)*100)}%"></div></div><small>${d.date.slice(5)}</small></div>`).join('')}</div><p class="helper">${recent[0].date} to ${recent.at(-1).date}.${days.length>20?' Showing the latest 20 recorded days.':''} Values are average scores out of 100. Scores describe risk signals, not proof of wrongdoing.</p>`;
});

// Reuse the bounded transaction read; the canvas code is loaded separately from the shell.
let disposeActivity;
async function loadActivity(){
  const element=document.getElementById('transaction-activity');renderLoading(element,'transaction activity');
  try{const [transactions,{mountTransactionSkyline}]=await Promise.all([getTransactions(),import('../islands/transaction-skyline.tsx')]);disposeActivity?.();disposeActivity=mountTransactionSkyline(element,transactions,DEMO_MODE);}
  catch(error){renderLoadError(element,error,()=>{clearDataCache();loadActivity();});}
}
loadActivity();
