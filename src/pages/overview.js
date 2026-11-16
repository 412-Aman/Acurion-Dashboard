import '../styles/main.css';
import { renderLayout } from '../components/layout.js';
import { escapeHTML as esc, icon } from '../components/icons.js';
import { mountGatewayFlow } from '../islands/ambient.tsx';
import { getOverviewStats, getAlerts, getTransactions, getRiskTimeline, clearDataCache, subscribeToUpdates } from '../lib/dataService.js';
import { mountLiveDetection } from '../components/liveDetection.js';
import { compareAlertPriority } from '../lib/dataContracts.js';
import { loadWorkspace } from '../lib/complianceStore.js';
import { customerRisk } from '../lib/amlEngine.js';
import { formatDateTime, formatRisk, severityBadgeClass } from '../lib/utils.js';
import { riskMeter } from '../components/visuals.js';
import { countUp } from '../lib/countUp.js';
import { infoButton } from '../components/infoPop.js';
import { DEMO_MODE } from '../lib/config.js';
import { renderLoadError, renderLoading } from '../components/dataFeedback.js';
const main=renderLayout({active:'index.html',pageTitle:'Overview',pageSubtitle:'What needs your attention today'});
const howItWorks=`<ol class="info-steps"><li><strong>Review alerts.</strong> Open one, see why it was flagged, record your decision.</li><li><strong>Follow the evidence.</strong> Open the payment or the account map to see who else is involved.</li><li><strong>Build a case.</strong> Keep notes and evidence, then prepare a report for a reviewer.</li></ol>`;
main.innerHTML=`<section class="hero-card ov-hero"><div class="hero-flow" id="overview-flow" aria-hidden="true"></div><div class="ov-hero-copy"><span class="section-kicker">Today</span><h2>Here’s what needs you.</h2>${infoButton(howItWorks,{title:'How a review works',label:'How it works'})}</div>
  <div class="ov-actions"><a class="ov-action" href="alerts.html" data-tone="alert"><span class="ov-action-icon">${icon('alerts',20)}</span><strong id="ov-alerts">–</strong><span>alerts to review</span><i class="ov-action-go" aria-hidden="true">${icon('arrow',16)}</i></a><a class="ov-action" href="compliance.html?view=cases"><span class="ov-action-icon">${icon('cases',20)}</span><strong id="ov-cases">–</strong><span>open cases</span><i class="ov-action-go" aria-hidden="true">${icon('arrow',16)}</i></a><button type="button" class="ov-action" data-open-upload data-tone="upload"><span class="ov-action-icon">${icon('upload',20)}</span><strong>Upload</strong><span>a bank file to scan</span><i class="ov-action-go" aria-hidden="true">${icon('arrow',16)}</i></button></div></section>
<section class="card page-section live-card" id="live-detection" aria-labelledby="live-title"></section>
<div class="overview-columns"><section class="card"><div class="section-heading"><h3>Top alerts</h3><a href="alerts.html" class="btn-ghost">All alerts</a></div><div id="priority-alerts"></div></section><section class="card"><div class="section-heading"><h3>Checks to do</h3><a href="compliance.html?view=customers" class="btn-ghost">Customers</a></div><div id="review-tasks"></div></section></div>
<section class="page-section" aria-labelledby="numbers-title"><div class="page-section-heading"><h2 id="numbers-title">At a glance</h2>${infoButton('<p>Counts cover the records loaded on this page (up to 2,000 per source), not every record in the database.</p><p>“Block recommended” is an outcome the rules recorded. Acurion never moves or blocks money itself.</p>',{title:'About these numbers'})}</div><div class="stat-tiles" id="stat-cards"></div></section>
<div id="transaction-activity" class="page-section"></div>
<section class="card page-section" id="risk-section" hidden><div class="section-heading"><h3>Risk over time</h3><div class="chart-legend" aria-hidden="true"><span><i class="tone-ok"></i>Low</span><span><i class="tone-warn"></i>Medium</span><span><i class="tone-crit"></i>High</span></div></div><div id="risk-chart" class="risk-timeline"></div></section>`;
mountGatewayFlow(document.getElementById('overview-flow'),true);
mountLiveDetection(document.getElementById('live-detection'));
if(location.hash==='#live-detection')requestAnimationFrame(()=>document.getElementById('live-detection').scrollIntoView({block:'start'}));
async function region(id,loader,renderer) {
  const element=document.getElementById(id);renderLoading(element);
  try{renderer(element,await loader());}catch(error){renderLoadError(element,error,()=>{clearDataCache();region(id,loader,renderer);});}
}
const renderPriority=(element,alerts)=>{
  const pending=alerts.filter(a=>!['closed','resolved'].includes(a.status)).sort(compareAlertPriority);
  countUp(document.getElementById('ov-alerts'),pending.length);
  element.innerHTML=pending.length?`<div class="priority-list">${pending.slice(0,5).map(a=>`<a class="priority-row" data-severity="${esc(a.severity)}" href="alerts.html?alert=${encodeURIComponent(a.id)}"><div><strong>${esc(a.id)}</strong><small><span class="pii">${esc(a.suspiciousAccount)}</span> · ${formatDateTime(a.timestamp)}</small></div>${riskMeter(a)}<span class="${severityBadgeClass(a.severity)}">${esc(a.severity)}</span></a>`).join('')}</div>`:'<div class="data-empty is-clear"><strong>All clear</strong><p>No open alerts right now.</p></div>';
};
// Live updates count on from the previous numbers, not from zero.
let lastStats={};
const renderStats=(element,stats)=>{element.innerHTML=[['totalTransactions24h','Payments','transactions.html','transactions',false],['totalAlerts','Alerts','alerts.html','alerts',false],['openAlerts','To review','alerts.html','alerts',true],['blockedTransactions','Block recommended','transactions.html?decision=block','shield',false]].map(([key,label,href,name,emphasis])=>`<a class="stat-tile" href="${href}"${emphasis&&stats[key]>0?' data-emphasis':''}><div class="stat-tile-top"><span class="stat-tile-icon">${icon(name,16)}</span><span class="stat-tile-label">${label}</span></div><strong class="stat-tile-value" data-count="${lastStats[key]??0}" data-count-to="${stats[key]}">${(lastStats[key]??0).toLocaleString('en-GB')}</strong><span class="stat-tile-go" aria-hidden="true">${icon('arrow',16)}</span></a>`).join('');element.querySelectorAll('[data-count-to]').forEach(node=>countUp(node,Number(node.dataset.countTo)));lastStats={...stats};};
region('stat-cards',getOverviewStats,renderStats);
region('priority-alerts',getAlerts,renderPriority);
// Live: the queue and counts follow new alerts and reviews without a reload (the listener holds the records).
let pendingUpdate;
subscribeToUpdates('alerts',update=>{if(update.type!=='updated')return;clearTimeout(pendingUpdate);pendingUpdate=setTimeout(()=>{renderPriority(document.getElementById('priority-alerts'),update.items);getOverviewStats().then(stats=>renderStats(document.getElementById('stat-cards'),stats)).catch(()=>{});},400);});
try{
  const state=loadWorkspace(),now=Date.now();
  const due=state.customers.filter(c=>!c.reviewedAt||Date.parse(c.reviewedAt)+state.policy.reviewDays*86400000<now);
  const pending=state.findings.filter(f=>f.disposition==='pending').length, high=state.customers.filter(c=>customerRisk(c,state.assessments,state.findings).score>=60).length;
  countUp(document.getElementById('ov-cases'),state.cases.filter(c=>c.status!=='closed').length);
  document.getElementById('review-tasks').innerHTML=[['compliance.html?view=customers',due.length,'Customer checks due','customers'],['compliance.html?view=screening',pending,'Watchlist matches to resolve','screening'],['compliance.html?view=customers',high,'High-risk customers','shield'],['compliance.html?view=cases',state.cases.filter(c=>c.status==='ready').length,'Cases ready for sign-off','cases']].map(([href,count,label,name])=>`<a class="task-row" href="${href}" data-has-items="${count>0}"><span class="task-row-label"><span class="task-row-icon">${icon(name,16)}</span>${label}</span><strong>${count>0?count:icon('check',15)}</strong></a>`).join('');
}catch(error){renderLoadError(document.getElementById('review-tasks'),error,()=>location.reload());}
// Shown only when the loaded payments carry model scores; otherwise there is nothing to draw.
region('risk-chart',getRiskTimeline,(element,days)=>{
  const section=document.getElementById('risk-section');
  section.hidden=!days.length;if(!days.length){element.innerHTML='';return;}
  const recent=days.slice(-20);
  const tone=v=>v>.6?'crit':v>.35?'warn':'ok';
  element.innerHTML=`<div class="timeline-bars" role="list">${recent.map(d=>`<div class="timeline-day" role="listitem" title="${d.date}: ${formatRisk(d.avgRisk)} from ${d.count} records"><span>${Math.round(d.avgRisk*100)}</span><div class="timeline-track"><div class="timeline-bar tone-${tone(d.avgRisk)}" style="height:${Math.max(3,Math.min(1,d.avgRisk)*100)}%"></div></div><small>${d.date.slice(5)}</small></div>`).join('')}</div><div class="timeline-foot"><span>${recent[0].date} to ${recent.at(-1).date}</span>${infoButton(`<p>The daily average of the model scores on the loaded payments, out of 100.${days.length>20?' Showing the latest 20 days.':''}</p><p>Payments without a score or a date are left out. Scores are risk signals, not proof of wrongdoing.</p>`,{title:'About this chart'})}</div>`;
});

// Reuse the bounded transaction read; the canvas code is loaded separately from the shell.
let disposeActivity;
async function loadActivity(){
  const element=document.getElementById('transaction-activity');renderLoading(element,'transaction activity');
  try{const [transactions,{mountTransactionSkyline}]=await Promise.all([getTransactions(),import('../islands/transaction-skyline.tsx')]);disposeActivity?.();disposeActivity=mountTransactionSkyline(element,transactions,DEMO_MODE);}
  catch(error){renderLoadError(element,error,()=>{clearDataCache();loadActivity();});}
}
loadActivity();
