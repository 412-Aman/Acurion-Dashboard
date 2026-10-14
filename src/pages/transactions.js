import '../styles/main.css';
import { renderLayout } from '../components/layout.js';
import { getTransactions,getAlerts,clearDataCache } from '../lib/dataService.js';
import { escapeHTML as esc,icon } from '../components/icons.js';
import { formatDateTime,formatCurrency,formatRisk,decisionBadgeClass } from '../lib/utils.js';
import { renderLoadError,renderLoading } from '../components/dataFeedback.js';
import { DEMO_MODE } from '../lib/config.js';
const main=renderLayout({active:'transactions.html',pageTitle:'Transactions',pageSubtitle:'Inspect source events and follow their alert or account evidence'});
main.innerHTML=`<div class="filter-toolbar"><input id="search" class="input" placeholder="Find transaction or account" aria-label="Search transactions"><select id="decision-filter" class="input" aria-label="Decision"><option value="">All recommendations</option>${['pass','flag','block','unassessed'].map(value=>`<option>${value}</option>`).join('')}</select><select id="currency-filter" class="input" aria-label="Currency"><option value="">All currencies</option></select><select id="sort" class="input" aria-label="Sort transactions"><option value="time-desc">Newest first</option><option value="risk-desc">Highest recorded model score</option><option value="amount-desc">Highest amount in selected currency</option></select><button class="btn-ghost" id="reset-filters">Clear filters</button></div><p class="helper mb-3" id="tx-context" role="status"></p><div id="tx-results"></div><p class="helper mt-3" id="count-label"></p><dialog class="detail-dialog" id="transaction-dialog" aria-label="Transaction details"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close transaction details">${icon('close')}</button></form><div id="transaction-detail"></div></dialog>`;
let allTx=[],alerts=[];
const params=new URLSearchParams(location.search);let accountFilter=params.get('account')||'';
function renderRows(){
  const query=document.getElementById('search').value.toLowerCase(),decision=document.getElementById('decision-filter').value,currency=document.getElementById('currency-filter').value,sort=document.getElementById('sort').value;
  const rows=allTx.filter(t=>(!accountFilter||[t.fromAccount,t.toAccount].includes(accountFilter))&&(!query||`${t.id} ${t.fromAccount} ${t.toAccount}`.toLowerCase().includes(query))&&(!decision||t.decision===decision)&&(!currency||t.currency===currency));
  rows.sort((a,b)=>sort==='risk-desc'?(b.riskScore??-1)-(a.riskScore??-1):sort==='amount-desc'&&currency?(b.amount??-1)-(a.amount??-1):(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0));
  document.getElementById('tx-context').textContent=sort==='amount-desc'&&!currency?'Choose a currency before comparing amounts. Showing newest first.':accountFilter?`Account history for ${accountFilter} within the loaded sample. Clear filters to see all transactions.`:'';
  document.getElementById('count-label').textContent=`${rows.length} of ${allTx.length} loaded transactions · ${DEMO_MODE?'Fictional demo data':'Bounded Firebase sample'} · This is not a complete account history.`;
  const result=document.getElementById('tx-results');
  result.innerHTML=rows.length?`<div class="card !p-0 table-wrap"><table class="workspace-table"><thead><tr><th>Transaction / source</th><th>From</th><th>To</th><th>Amount</th><th>Channel</th><th>Model score</th><th>Recommendation</th><th>Event time</th></tr></thead><tbody>${rows.map(t=>`<tr><td><button class="text-button font-mono" data-transaction="${esc(t.id)}">${esc(t.id)}</button><small>${esc(t.sourceDataset||'Source not supplied')}</small></td><td>${esc(t.fromAccount)}</td><td>${esc(t.toAccount)}</td><td>${formatCurrency(t.amount,t.currency)}</td><td>${esc(t.channel||'Not supplied')}</td><td>${formatRisk(t.riskScore)}</td><td><span class="${decisionBadgeClass(t.decision)}">${esc(t.decision)}</span></td><td>${formatDateTime(t.timestamp)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="card data-empty">No transactions match this view. Clear filters or check System status.</div>';
  result.querySelectorAll('[data-transaction]').forEach(button=>button.onclick=()=>openTransaction(allTx.find(t=>t.id===button.dataset.transaction)));
}
function openTransaction(tx){
  if(!tx)return;
  const linked=alerts.filter(a=>a.transactionId===tx.id),dialog=document.getElementById('transaction-dialog');
  document.getElementById('transaction-detail').innerHTML=`<h2 class="font-mono pr-8">${esc(tx.id)}</h2><p class="helper">${DEMO_MODE?'Fictional transaction':'Configured source record'}</p><dl class="detail-list">${[['From account',tx.fromAccount],['To account',tx.toAccount],['Amount',formatCurrency(tx.amount,tx.currency)],['Event time',formatDateTime(tx.timestamp)],['Source',tx.sourceDataset||'Not supplied'],['Recorded model score',formatRisk(tx.riskScore)],['Rule policy points',tx.ruleScore==null?'Not supplied':`${tx.ruleScore}/100 (deterministic policy)`],['Recommendation',tx.decision],['Model version',tx.modelVersion||'Not supplied'],['Policy version',tx.policyVersion||'Not supplied']].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${tx.relativeTime?`<p class="helper">${esc(tx.relativeTime)}. This relative dataset time is not converted into an invented calendar date.</p>`:''}${tx.dataQuality?.length?`<div class="notice">Data quality: ${tx.dataQuality.map(esc).join('; ')}</div>`:''}<div class="record-links">${tx.fromAccount!=='Not supplied'?`<a class="btn-ghost" href="graph.html?account=${encodeURIComponent(tx.fromAccount)}">${icon('graph',14)}Explore sender</a>`:''}${tx.toAccount!=='Not supplied'?`<a class="btn-ghost" href="graph.html?account=${encodeURIComponent(tx.toAccount)}">Explore receiver</a>`:''}</div><h3>Linked alerts</h3><div class="evidence-list">${linked.map(a=>`<a href="alerts.html?alert=${encodeURIComponent(a.id)}">${esc(a.id)}<small>${esc(a.severity)} · ${esc(a.status)}</small></a>`).join('')||'<p class="helper">No referenced alert in the loaded sample.</p>'}</div>`;
  if(!dialog.open)dialog.showModal();
}
async function init(){
  renderLoading(document.getElementById('tx-results'),'transactions');
  const results=await Promise.allSettled([getTransactions(),getAlerts()]);
  if(results[0].status==='rejected'){renderLoadError(document.getElementById('tx-results'),results[0].reason,()=>{clearDataCache();init();});return;}
  allTx=results[0].value;alerts=results[1].status==='fulfilled'?results[1].value:[];
  document.getElementById('currency-filter').innerHTML='<option value="">All currencies</option>'+[...new Set(allTx.map(t=>t.currency).filter(Boolean))].sort().map(currency=>`<option>${esc(currency)}</option>`).join('');renderRows();
  const id=params.get('transaction');if(id){const tx=allTx.find(t=>t.id===id);if(tx)openTransaction(tx);else document.getElementById('tx-context').textContent='The referenced transaction is outside the loaded sample or is unavailable.';}
}
for(const id of ['search','decision-filter','currency-filter','sort'])document.getElementById(id).addEventListener(id==='search'?'input':'change',renderRows);
document.getElementById('reset-filters').onclick=()=>{for(const id of ['search','decision-filter','currency-filter'])document.getElementById(id).value='';accountFilter='';history.replaceState(null,'','transactions.html');renderRows();};init();
