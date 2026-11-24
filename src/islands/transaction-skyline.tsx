import { createRoot } from 'react-dom/client';
import { useMemo,useState } from 'react';
import ContributionSkyline,{type ContributionDay} from '@/components/ui/contribution-skyline';
import { transactionActivity } from '../lib/transactionActivity.js';
import { infoButton } from '../components/infoPop.js';

type Transaction={id:string;timestamp:string|null};
function TransactionSkyline({transactions,demo}:{transactions:Transaction[];demo:boolean}){
  const activity=useMemo(()=>transactionActivity(transactions),[transactions]);
  const [selected,setSelected]=useState<ContributionDay|null>(null);
  const date=(value:string)=>new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  if(!activity.endDate)return <div className="card data-empty"><strong>No dated payments yet</strong><p>The loaded payments have no dates, so there is nothing to draw.</p><a className="text-button" href="transactions.html">See payments</a></div>;
  const busiest=activity.days.reduce((best,day)=>day.count>best.count?day:best,{date:activity.endDate,count:0});
  const selectedTransactions=selected?transactions.filter(transaction=>transaction.timestamp&&Number.isFinite(Date.parse(transaction.timestamp))&&new Date(transaction.timestamp).toISOString().slice(0,10)===selected.date):[];
  return <section className="transaction-activity" aria-label="Loaded transaction activity">
    <div className="activity-heading"><div><span className="section-kicker">Activity</span><h2>Payments per day</h2></div><div className="activity-heading-actions"><span className="info-slot" dangerouslySetInnerHTML={{__html:infoButton(`<p>${demo?'The sample customers’ payments in this demo workspace.':'Payments loaded from the live workspace (up to 2,000).'} Days are UTC.</p><p>A blank day means no loaded payments, not that none happened.</p><dl class="info-facts"><div><dt>Days with payments</dt><dd>${activity.days.length}</dd></div><div><dt>Payments without a date</dt><dd>${activity.missing} (left out)</dd></div>${activity.outsideWindow>0?`<div><dt>Older than the calendar</dt><dd>${activity.outsideWindow} (left out)</dd></div>`:''}</dl>`,{title:'About this calendar'})}}/><a className="btn-ghost" href="transactions.html">Payments</a></div></div>
    <ContributionSkyline data={activity.days} endDate={activity.endDate} palette={{light:["#bfe0dc","#7cc3bb","#3aa197","#14756d"],dark:["#163a3d","#1d6661","#168c83","#3fb3a8"]}} defaultView="3d" duration={900} unit="payment" unitPlural="payments" title="Last 12 months" showStats={false} onCellClick={setSelected} className="transaction-skyline" footer={<span>Up to {date(activity.endDate)}. Hover or tap a day for its count.</span>}/>
    <dl className="activity-summary is-two"><div><dt>Payments shown</dt><dd>{activity.represented.toLocaleString('en-GB')}</dd></div><div><dt>Busiest day</dt><dd>{busiest.count}<small>{date(busiest.date)}</small></dd></div></dl>
    {selected&&<section className="activity-day" aria-label="Selected transaction day"><div><h3>{date(selected.date)}</h3><p>{selected.count} {selected.count===1?'payment':'payments'} on this day (UTC).</p></div>{selectedTransactions.length>0?<div className="activity-day-links">{selectedTransactions.slice(0,5).map(transaction=><a key={transaction.id} href={`transactions.html?transaction=${encodeURIComponent(transaction.id)}`}>{transaction.id} ↗</a>)}{selectedTransactions.length>5&&<span>and {selectedTransactions.length-5} more</span>}</div>:<p className="helper">No loaded payments on this day.</p>}<button className="icon-button" aria-label="Close selected day" onClick={()=>setSelected(null)}>×</button></section>}
    <details className="activity-table"><summary>Daily counts as a table <span>{activity.days.length} days</span></summary><div className="table-wrap"><table className="workspace-table"><thead><tr><th>Day (UTC)</th><th>Payments</th><th>Open</th></tr></thead><tbody>{activity.days.slice().reverse().map(day=><tr key={day.date} data-row-link=""><td>{date(day.date)}</td><td>{day.count}</td><td><button className="text-button row-primary" data-row-primary="" onClick={()=>setSelected(day)}>View day</button></td></tr>)}</tbody></table></div></details>
  </section>;
}
export function mountTransactionSkyline(element:HTMLElement,transactions:Transaction[],demo:boolean){const root=createRoot(element);root.render(<TransactionSkyline transactions={transactions} demo={demo}/>);return()=>root.unmount();}
