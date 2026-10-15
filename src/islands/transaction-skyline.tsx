import { createRoot } from 'react-dom/client';
import { useMemo,useState } from 'react';
import ContributionSkyline,{type ContributionDay} from '@/components/ui/contribution-skyline';
import { transactionActivity } from '../lib/transactionActivity.js';

type Transaction={id:string;timestamp:string|null};
function TransactionSkyline({transactions,demo}:{transactions:Transaction[];demo:boolean}){
  const activity=useMemo(()=>transactionActivity(transactions),[transactions]);
  const [selected,setSelected]=useState<ContributionDay|null>(null);
  const date=(value:string)=>new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  if(!activity.endDate)return <div className="card data-empty"><strong>No dated transactions to display</strong><p>The loaded records have no usable transaction timestamps. No activity has been generated.</p><a className="text-button" href="transactions.html">Inspect loaded transactions →</a></div>;
  const busiest=activity.days.reduce((best,day)=>day.count>best.count?day:best,{date:activity.endDate,count:0});
  const selectedTransactions=selected?transactions.filter(transaction=>transaction.timestamp&&Number.isFinite(Date.parse(transaction.timestamp))&&new Date(transaction.timestamp).toISOString().slice(0,10)===selected.date):[];
  return <section className="transaction-activity" aria-label="Loaded transaction activity">
    <div className="activity-heading"><div><span className="section-kicker">ACTIVITY / UTC CALENDAR</span><h2>Every day, in perspective.</h2><p>{demo?'Fictional demo transactions.':'Loaded Firebase transaction sample.'} Blank days mean no records in this sample. They do not establish that no transactions occurred.</p></div><a className="btn-ghost" href="transactions.html">View records →</a></div>
    <ContributionSkyline data={activity.days} endDate={activity.endDate} palette="mono" defaultView="3d" duration={900} unit="loaded transaction" unitPlural="loaded transactions" title="Transaction activity" showStats={false} onCellClick={setSelected} className="transaction-skyline" footer={<span>Calendar ending {date(activity.endDate)} · UTC · Hover or tap for counts. Arrow keys explore days; drag in 3D to orbit.</span>}/>
    <dl className="activity-summary"><div><dt>Shown in this calendar</dt><dd>{activity.represented.toLocaleString()}<small>loaded transactions</small></dd></div><div><dt>Days with loaded activity</dt><dd>{activity.days.length}<small>within the displayed calendar</small></dd></div><div><dt>Busiest loaded day</dt><dd>{busiest.count}<small>{date(busiest.date)}</small></dd></div><div><dt>Missing timestamps</dt><dd>{activity.missing}<small>excluded from this calendar</small></dd></div></dl>
    {activity.outsideWindow>0&&<p className="helper">{activity.outsideWindow} dated records are older than the displayed calendar and are excluded.</p>}
    {selected&&<section className="activity-day" aria-label="Selected transaction day"><div><h3>{date(selected.date)}</h3><p>{selected.count} loaded {selected.count===1?'transaction':'transactions'} on this UTC day.</p></div>{selectedTransactions.length>0?<div className="activity-day-links">{selectedTransactions.slice(0,5).map(transaction=><a key={transaction.id} href={`transactions.html?transaction=${encodeURIComponent(transaction.id)}`}>{transaction.id} ↗</a>)}{selectedTransactions.length>5&&<span>and {selectedTransactions.length-5} more in the loaded sample</span>}</div>:<p className="helper">No transactions from the loaded sample fall on this day.</p>}<button className="icon-button" aria-label="Close selected day" onClick={()=>setSelected(null)}>×</button></section>}
    <details className="activity-table"><summary>View daily counts as a table <span>{activity.days.length} recorded days</span></summary><div className="table-wrap"><table className="workspace-table"><thead><tr><th>UTC day</th><th>Loaded transactions</th><th>Inspect</th></tr></thead><tbody>{activity.days.slice().reverse().map(day=><tr key={day.date}><td>{date(day.date)}</td><td>{day.count}</td><td><button className="text-button" onClick={()=>setSelected(day)}>View day</button></td></tr>)}</tbody></table></div></details>
  </section>;
}
export function mountTransactionSkyline(element:HTMLElement,transactions:Transaction[],demo:boolean){const root=createRoot(element);root.render(<TransactionSkyline transactions={transactions} demo={demo}/>);return()=>root.unmount();}
