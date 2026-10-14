import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransaction,normalizeAlert,validateReview,compareAlertPriority } from '../src/lib/dataContracts.js';
import { ingestEvents,scenarioEvents,validateEvent } from '../src/lib/eventIngestion.js';
import { assessTransaction,defaultPolicy,accountBehavior } from '../src/lib/amlEngine.js';
import { findTransactionPath,boundedNeighborhood,filterGraphEdges } from '../src/lib/graphInvestigation.js';
import { buildCaseReport,createCaseFromAlert,attachGraphEvidence } from '../src/lib/caseWorkflow.js';
import { seedCompliance } from '../src/data/complianceData.js';
import { withTimeout,describeDataError } from '../src/lib/dataStatus.js';
const customer=seedCompliance().customers[0];
test('live data does not invent model scores, dates, currency, identities or graph explanations',()=>{
  const tx=normalizeTransaction('IEEE-1',{sourceDataset:'IEEE_CIS',isFraud:1,payerEmailDomain:'example.com',amount:20,transactionTime:360});
  assert.equal(tx.riskScore,null);assert.equal(tx.timestamp,null);assert.equal(tx.currency,null);assert.equal(tx.fromAccount,'Not supplied');assert.equal(tx.decision,'unassessed');assert.equal(tx.dataQuality.length,3);
  const alert=normalizeAlert('A1',{reason:'Review',transactionId:'T1'});
  assert.equal(alert.gnnExplanation,null);assert.equal(alert.shapExplanation,null);assert.equal(alert.riskScore,null);assert.equal(alert.suspiciousAccount,'Not supplied');assert.equal(alert.timestamp,null);
});
test('canonical and existing transaction schemas preserve source values and score scales',()=>{
  const tx=normalizeTransaction('T1',{event_id:'E1',sender_account_id:'C1',receiver_account_id:'C2',amount:123,currency:'AED',timestamp:'2026-10-01T12:00:00Z',riskScore:80,decision:'FLAG'});
  assert.equal(tx.id,'E1');assert.equal(tx.fromAccount,'C1');assert.equal(tx.riskScore,.8);assert.equal(tx.decision,'flag');assert.equal(tx.dataQuality.length,0);
  const ibm=normalizeTransaction('T2',{fromAccount:'C1',toAccount:'C2',amountPaid:321,paymentCurrency:'US Dollar',timestamp:'2026/10/01 12:00'});
  assert.equal(ibm.currency,'USD');assert.equal(ibm.timestamp,'2026-10-01T12:00:00.000Z');
  assert.equal(normalizeAlert('A',{riskScore:1,riskScoreScale:'0-100'}).riskScore,.01);
  assert.equal(normalizeAlert('A',{riskScore:true}).riskScore,null);
  assert.equal(normalizeAlert('A',{timestamp:{seconds:1790856000,nanoseconds:0}}).timestamp,'2026-10-01T12:00:00.000Z');
});
test('analyst disposition requires ownership and rationale without changing the recommendation',()=>{
  assert.ok(validateReview({status:'closed',owner:'',note:'',disposition:''}).length>=3);
  assert.deepEqual(validateReview({status:'closed',owner:'Investigator',note:'Reviewed the evidence and documented outcome.',disposition:'no_further_action'}),[]);
  assert.ok(validateReview({status:'deleted',note:'Reviewed available evidence.'}).length);
});
test('event imports reject malformed/real records and exclude labels from accepted fields',()=>{
  const event=scenarioEvents('velocity')[0];
  for(const patch of [{amount:-1},{timestamp:'2026-10-01 12:00'},{timestamp:'2026-02-30T12:00:00Z'},{currency:'Dirhams'},{synthetic:false},{event_id:''}])assert.ok(validateEvent({...event,...patch}).length);
  const result=ingestEvents([],[{...event,label:1,ip:'private-value'}, {...event,event_id:'bad',amount:-1}]);
  assert.equal(result.accepted.length,1);assert.equal(result.rejected.length,1);assert.equal(result.accepted[0].label,undefined);assert.equal(result.accepted[0].ip,undefined);assert.equal(result.rejected[0].amount,undefined);
});
test('duplicate imports are idempotent, conflicting IDs rejected, and equivalent times match',()=>{
  const events=scenarioEvents('structuring'),first=ingestEvents([],events),second=ingestEvents(first.transactions,events);
  assert.equal(second.transactions.length,3);assert.equal(second.duplicates,3);
  assert.equal(ingestEvents(first.transactions,[{...events[0],amount:999}]).rejected.length,1);
  assert.equal(ingestEvents(first.transactions,[{...events[0],timestamp:'2026-10-01T16:00:00+04:00'}]).duplicates,1);
});
test('velocity rules count unique valid events in the configured event-time and currency window',()=>{
  const txs=ingestEvents([],scenarioEvents('velocity')).transactions,tx=txs.at(-1);
  const result=assessTransaction(tx,customer,[...txs,...txs]);assert.ok(result.reasons.some(r=>r.code==='VELOCITY'));
  const reduced=txs.map((t,i)=>i===0?{...t,timestamp:'2026-10-01T12:10:00Z'}:i===1?{...t,currency:'USD'}:t);
  assert.ok(!assessTransaction(tx,customer,reduced).reasons.some(r=>r.code==='VELOCITY'));
  assert.equal(result.policySnapshot.velocityMinutes,5);assert.ok(result.featureWindow.end);assert.equal(result.policyVersion,'rules-1.1');
});
test('near-threshold pattern triggers at the count boundary and excludes above-threshold transfers',()=>{
  const txs=ingestEvents([],scenarioEvents('structuring')).transactions;
  assert.ok(assessTransaction(txs.at(-1),customer,txs).reasons.some(r=>r.code==='STRUCTURING'));
  assert.ok(!assessTransaction(txs[1],customer,txs).reasons.some(r=>r.code==='STRUCTURING'));
  assert.ok(!assessTransaction(txs.at(-1),customer,[{...txs[0],amount:50000},txs[1],txs[2]]).reasons.some(r=>r.code==='STRUCTURING'));
});
test('invalid events cannot receive a pass recommendation',()=>{
  const tx=ingestEvents([],scenarioEvents('velocity')).transactions[0];
  assert.equal(assessTransaction({...tx,amount:NaN},customer,[]).decision,'flag');
  assert.equal(assessTransaction({...tx,timestamp:null},customer,[]).decision,'flag');
});
test('disabled pattern rules stop matching while behavioural aggregates remain event-time safe',()=>{
  const txs=ingestEvents([],scenarioEvents('structuring')).transactions,tx=txs.at(-1);
  assert.ok(!assessTransaction(tx,customer,txs,{...defaultPolicy,structuringEnabled:false}).reasons.some(r=>r.code==='STRUCTURING'));
  const velocity=ingestEvents([],scenarioEvents('velocity')).transactions;
  assert.ok(!assessTransaction(velocity.at(-1),customer,velocity,{...defaultPolicy,velocityEnabled:false}).reasons.some(r=>r.code==='VELOCITY'));
  const features=accountBehavior(tx,[...txs,...txs,{...tx,id:'future',timestamp:'2026-10-01T12:02:00Z'},{...tx,id:'fx',currency:'USD'}]);
  assert.equal(features.outgoingCount,3);assert.equal(features.totalOutflow,137000);assert.equal(features.uniqueCounterparties,1);
});
test('priority puts open critical rule alerts before high model alerts without adding scores',()=>{
  const alerts=[{id:'closed',status:'closed',severity:'critical',riskScore:1},{id:'model',status:'open',severity:'high',riskScore:.95},{id:'rule',status:'open',severity:'critical',riskScore:null,ruleScore:100}];
  assert.deepEqual(alerts.sort(compareAlertPriority).map(a=>a.id),['rule','model','closed']);
});
const edge=(id,source,target,time,type='transaction')=>({id,source,target,timestamp:time,type,amount:100,currency:'AED'});
const links=[edge('T1','A','B','2026-10-01T12:00:00Z'),edge('T2','B','C','2026-10-01T12:01:00Z'),edge('T3','B','C','2026-10-01T11:00:00Z'),edge('S1','A','C','2026-10-01T12:00:00Z','shared_device')];
test('dated paths preserve transfer direction, chronology and distinct repeated transfer IDs',()=>{
  const result=findTransactionPath(links,'A','C');assert.deepEqual(result.edges.map(e=>e.id),['T1','T2']);
  assert.equal(findTransactionPath(links,'C','A'),null);assert.equal(findTransactionPath([links[0],links[2],links[3]],'A','C'),null);
  assert.equal(findTransactionPath(links,'A','C',1),null);assert.equal(findTransactionPath([{...links[0],timestamp:null},links[1]],'A','C'),null);
});
test('neighborhoods obey hop and account limits and omit dangling edges',()=>{
  const nodes=['A','B','C','D'].map(id=>({id})),edges=[...links,edge('T4','C','D','2026-10-01T12:03:00Z')];
  const result=boundedNeighborhood(nodes,edges,'A',3,2);assert.equal(result.nodes.length,2);assert.equal(result.truncated,true);
  assert.ok(result.edges.every(e=>result.nodes.some(n=>n.id===e.source)&&result.nodes.some(n=>n.id===e.target)));
  assert.equal(boundedNeighborhood(nodes,edges,'missing').nodes.length,0);
});
test('graph filters exclude missing fields and do not mix currencies in amount comparisons',()=>{
  assert.equal(filterGraphEdges([...links,{id:'missing',source:'A',target:'B',type:'transaction'}],{minimumAmount:50,currency:'AED',start:'2026-10-01T12:00:00Z'}).length,3);
  assert.equal(filterGraphEdges(links,{type:'shared_device'}).length,1);
});
test('case evidence persists idempotently, captures graph source IDs and excludes document bodies from report',()=>{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const tx={id:'TX',fromAccount:'ACCOUNT-1',toAccount:'ACCOUNT-2',amount:123,currency:'AED',timestamp:'2026-10-01T12:00:00Z'};
  const alert={id:'ALERT',transactionId:'TX',reason:'Threshold review',decision:'flag'};
  const caseId=createCaseFromAlert(alert,tx);assert.equal(createCaseFromAlert(alert,tx),caseId);
  attachGraphEvidence(caseId,{kind:'path',nodes:[{id:'A'},{id:'B'}],edges:[links[0]]});attachGraphEvidence(caseId,{kind:'path',nodes:[{id:'A'},{id:'B'}],edges:[links[0]]});
  const state=JSON.parse([...values.values()][0]),record=state.cases[0];record.owner='Analyst';record.narrative='Observed transfers';record.grounds='Review required';
  state.documents.push({customerId:record.customerId,name:'evidence.txt',sha256:'abc',content:'private body'});
  const report=buildCaseReport(state,record);assert.equal(report.transactions[0].id,'TX');assert.equal(report.sourceAlert.id,'ALERT');assert.equal(report.graphEvidence.length,1);assert.equal(report.documents[0].content,undefined);assert.equal(report.analystConclusion.narrative,'Observed transfers');
  assert.throws(()=>createCaseFromAlert(alert,null));assert.throws(()=>attachGraphEvidence('missing',{edges:[links[0]]}));
});
test('empty and denied source states stay distinguishable; stalled operations time out',async()=>{
  assert.match(describeDataError({code:'PERMISSION_DENIED'}),/denied/);assert.match(describeDataError({code:'auth/session-required'}),/Sign in/);
  assert.equal(await withTimeout(Promise.resolve([]),50).then(value=>value.length),0);
  await assert.rejects(withTimeout(new Promise(()=>{}),5),error=>error.code==='data/timeout');
});
