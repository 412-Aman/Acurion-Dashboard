export function validateEvent(event) {
  const errors=[];
  if(!event || typeof event!=='object')return ['Event must be an object'];
  for(const field of ['event_id','sender_account_id','receiver_account_id'])if(typeof event[field]!=='string'||!event[field].trim()||event[field].length>160)errors.push(`${field} must be a non-empty string of at most 160 characters`);
  if(typeof event.amount!=='number'||!Number.isFinite(event.amount)||event.amount<=0)errors.push('amount must be a positive finite number');
  if(typeof event.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.timestamp)||!Number.isFinite(Date.parse(event.timestamp)))errors.push('timestamp must be ISO-8601 with an explicit timezone');
  else { const [year,month,day]=event.timestamp.slice(0,10).split('-').map(Number); if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())errors.push('timestamp contains an invalid calendar date'); }
  if(!/^[A-Z]{3}$/.test(event.currency||''))errors.push('currency must use a three-letter ISO code');
  if(event.synthetic!==true)errors.push('Only explicitly synthetic events may be imported into this browser sandbox');
  return errors;
}
export function canonicalTransaction(event) {
  return {id:event.event_id,fromAccount:event.sender_account_id,toAccount:event.receiver_account_id,amount:event.amount,currency:event.currency,timestamp:new Date(event.timestamp).toISOString(),country:/^[A-Z]{2}$/.test(event.country||'')?event.country:'',channel:typeof event.transaction_type==='string'?event.transaction_type:'Transfer',sourceDataset:'Synthetic event import',synthetic:true};
}
const identity=tx=>JSON.stringify([tx.fromAccount,tx.toAccount,tx.amount,tx.currency,Date.parse(tx.timestamp)]);
export function ingestEvents(history,events) {
  if(!Array.isArray(events)||events.length>1000)throw new Error('Import an array of at most 1,000 synthetic events.');
  const records=new Map(history.map(tx=>[tx.id,tx])),accepted=[],rejected=[];
  let duplicates=0;
  events.forEach((event,index)=>{
    const errors=validateEvent(event);
    if(errors.length){rejected.push({eventId:typeof event?.event_id==='string'?event.event_id.slice(0,160):`row-${index+1}`,errors});return;}
    const tx=canonicalTransaction(event),prior=records.get(tx.id);
    if(prior){if(identity(prior)===identity(tx))duplicates++;else rejected.push({eventId:tx.id,errors:['Conflicting content for an existing event ID']});return;}
    records.set(tx.id,tx);accepted.push(tx);
  });
  return {transactions:[...records.values()],accepted,rejected,duplicates};
}
export function scenarioEvents(kind) {
  const amounts=kind==='structuring'?[44000,46000,47000]:[200,300,250,400,350,500];
  return amounts.map((amount,i)=>({event_id:`SIM-${kind.toUpperCase()}-${i+1}`,timestamp:new Date(Date.parse('2026-10-01T12:00:00Z')+i*30000).toISOString(),sender_account_id:'DEMO-001',receiver_account_id:'DEMO-CP-002',amount,currency:'AED',country:'AE',transaction_type:'Transfer',synthetic:true}));
}
