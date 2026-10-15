const DAY_MS=86400000;
// Input is the app's normalised transaction sample. Calendar days use UTC.
export function transactionActivity(transactions) {
  const counts=new Map();let missing=0;
  for(const transaction of transactions){
    const value=transaction.timestamp;
    if(!value || typeof value!=='string' || !Number.isFinite(Date.parse(value))){missing++;continue;}
    const key=new Date(value).toISOString().slice(0,10);
    counts.set(key,(counts.get(key)||0)+1);
  }
  const days=[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count}));
  const endDate=days.at(-1)?.date||null;
  if(!endDate)return {days:[],endDate:null,missing,represented:0,outsideWindow:0,startDate:null};
  const end=Date.parse(`${endDate}T00:00:00Z`);
  const nominalStart=end-364*DAY_MS;
  const start=nominalStart-new Date(nominalStart).getUTCDay()*DAY_MS;
  const startDate=new Date(start).toISOString().slice(0,10);
  const visible=days.filter(day=>day.date>=startDate);
  const represented=visible.reduce((sum,day)=>sum+day.count,0);
  return {days:visible,endDate,startDate,missing,represented,outsideWindow:transactions.length-missing-represented};
}
