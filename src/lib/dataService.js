// Bounded, authenticated reads. Live reads never substitute fictional records.
import { ref, get, query as dbQuery, limitToLast, onValue, update, push } from 'firebase/database';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, fs, requireSession } from './firebase.js';
import { transactions as mockTransactions, alerts as mockAlerts, graphData as mockGraphData, auditLogs as mockAuditLogs } from '../data/mockData.js';
import { DEMO_MODE, DATA_PATHS, READ_LIMIT } from './config.js';
import { normalizeAlert, normalizeTransaction, normalizeAuditLog, validateReview, isoTimestamp, finiteNumber } from './dataContracts.js';
import { setDataStatus, withTimeout } from './dataStatus.js';
import { loadWorkspace } from './complianceStore.js';
export const USE_FIREBASE = !DEMO_MODE;
const cache = new Map();
const pending = new Map();
const entries = value => Object.entries(value || {}).filter(([,data]) => data && typeof data === 'object');
export function clearDataCache() { cache.clear(); }
async function readPath(path, bounded = true) {
  await withTimeout(requireSession());
  const source = bounded ? dbQuery(ref(db,path),limitToLast(READ_LIMIT)) : ref(db,path);
  const snapshot = await withTimeout(get(source));
  return snapshot.exists() ? snapshot.val() : null;
}
async function load(resource, path, loader) {
  if (cache.has(resource)) return cache.get(resource);
  if (pending.has(resource)) return pending.get(resource);
  setDataStatus(resource,{ state:'loading', path, mode:DEMO_MODE?'demo':'firebase', error:null });
  const promise = loader().then(value => {
    cache.set(resource,value);
    const count = Array.isArray(value) ? value.length : value?.nodes?.length;
    setDataStatus(resource,{ state:count===0?'empty':'ready', count, lastSuccess:new Date().toISOString(), error:null });
    return value;
  }).catch(error => { setDataStatus(resource,{ state:'error', error:String(error.code || 'data/read-failed') }); throw error; }).finally(()=>pending.delete(resource));
  pending.set(resource,promise);
  return promise;
}
const DEMO_REVIEW_KEY = 'acurion.demo.alert-reviews.v1';
function demoReviews() { return JSON.parse(localStorage.getItem(DEMO_REVIEW_KEY) || '{"reviews":{},"audit":[]}'); }
export function getAlerts() {
  return load('alerts',DATA_PATHS.alerts,async()=>{
    if (DEMO_MODE) {
      const saved=demoReviews();
      const state=loadWorkspace();
      const ruleAlerts=state.assessments.filter(a=>a.decision!=='pass').map(a=>({id:`RULE-${a.transactionId}`,transactionId:a.transactionId,suspiciousAccount:a.customerId||state.transactions.find(t=>t.id===a.transactionId)?.fromAccount||'Not supplied',riskScore:null,ruleScore:a.score,evidenceTransactionIds:a.evidenceTransactionIds||[],ruleAssessment:a,decision:a.decision,severity:a.decision==='block'?'critical':a.score>=60?'high':'medium',status:'open',timestamp:state.transactions.find(t=>t.id===a.transactionId)?.timestamp||null,reason:a.reasons.map(r=>r.message).join('; '),sourceDataset:'Browser sandbox rules',policyVersion:a.policyVersion,ruleIds:a.reasons.map(r=>r.code),modelVersion:'',shapExplanation:null,gnnExplanation:null}));
      return [...mockAlerts,...ruleAlerts].map(a=>({ ...a, firebaseKey:a.id, owner:'', disposition:'', analystNote:'', modelVersion:a.ruleScore==null?'synthetic-demo':'', ...saved.reviews[a.id] }));
    }
    return entries(await readPath(DATA_PATHS.alerts)).map(([key,data])=>normalizeAlert(key,data));
  });
}
export async function getAlertById(id) { return (await getAlerts()).find(a=>a.id===id) || null; }
export function getTransactions() {
  return load('transactions',DATA_PATHS.transactions,async()=>{
    if(!DEMO_MODE)return entries(await readPath(DATA_PATHS.transactions)).map(([key,data])=>normalizeTransaction(key,data));
    const state=loadWorkspace();
    return [...mockTransactions.map(tx=>({...tx,dataQuality:[],modelVersion:'synthetic-demo'})),...state.transactions.map(tx=>{const assessment=state.assessments.find(a=>a.transactionId===tx.id);return {...tx,riskScore:null,ruleScore:assessment?.score??null,decision:assessment?.decision||'unassessed',dataQuality:[],policyVersion:assessment?.policyVersion,modelVersion:''};})];
  });
}
export async function getOverviewStats() {
  const [alerts,transactions] = await Promise.all([getAlerts(),getTransactions()]);
  return { totalTransactions24h:transactions.length,totalAlerts:alerts.length,openAlerts:alerts.filter(a=>!['closed','resolved'].includes(a.status)).length,
    blockedTransactions:transactions.filter(t=>t.decision==='block').length,flaggedTransactions:transactions.filter(t=>t.decision==='flag').length };
}
export async function getSeverityBreakdown() {
  const alerts=await getAlerts();
  return ['critical','high','medium','low','unknown'].map(severity=>({severity,count:alerts.filter(a=>a.severity===severity).length}));
}
export async function getRiskTimeline() {
  const transactions=await getTransactions();
  const days=new Map();
  for(const tx of transactions) {
    if(tx.riskScore==null || !tx.timestamp) continue;
    const day=tx.timestamp.slice(0,10), bucket=days.get(day)||{sum:0,count:0};
    bucket.sum+=tx.riskScore;bucket.count++;days.set(day,bucket);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,b])=>({date,avgRisk:b.sum/b.count,count:b.count}));
}
export function getGraphData() {
  return load('graph',DATA_PATHS.graph,async()=>{
    if(DEMO_MODE) {
      const state=loadWorkspace(),nodes=new Map(mockGraphData.nodes.map(n=>[n.data.id,n])),edges=[...mockGraphData.edges];
      for(const tx of state.transactions){for(const account of [tx.fromAccount,tx.toAccount])if(!nodes.has(account))nodes.set(account,{data:{id:account,label:account,risk:'unknown',sourceDataset:'Browser sandbox'}});edges.push({data:{id:tx.id,transactionId:tx.id,source:tx.fromAccount,target:tx.toAccount,type:'transaction',amount:tx.amount,currency:tx.currency,timestamp:tx.timestamp,sourceDataset:'Browser sandbox',flagged:state.assessments.some(a=>a.transactionId===tx.id&&a.decision!=='pass')}});}
      return {nodes:[...nodes.values()],edges};
    }
    const transactions=await getTransactions();
    const nodes=new Map(), edges=new Map();
    const addNode=(id,data={})=>{if(!id || id==='Not supplied')return;nodes.set(id,{data:{id,label:id,risk:'unknown',...nodes.get(id)?.data,...data}});};
    for(const tx of transactions) {
      if(tx.fromAccount==='Not supplied'||tx.toAccount==='Not supplied')continue;
      addNode(tx.fromAccount);addNode(tx.toAccount);
      edges.set(tx.id,{data:{id:tx.id,source:tx.fromAccount,target:tx.toAccount,type:'transaction',transactionId:tx.id,amount:tx.amount,currency:tx.currency,timestamp:tx.timestamp,sourceDataset:tx.sourceDataset,flagged:['flag','block'].includes(tx.decision)}});
    }
    // Optional graph/account enrichment has independent diagnostics. A denied path
    // never prevents the transaction-derived graph from being shown.
    const optional=async(resource,path)=>{
      try { const val=await readPath(path);setDataStatus(resource,{state:val?'ready':'empty',path,lastSuccess:new Date().toISOString(),mode:'firebase',error:null});return val; }
      catch(error){setDataStatus(resource,{state:'error',path,error:String(error.code||'data/read-failed'),mode:'firebase'});return null;}
    };
    const [accounts, graphEdges, shared] = await Promise.all([
      optional('accounts',DATA_PATHS.accounts),optional('graph edges',`${DATA_PATHS.graph}/edges`),optional('shared relationships',`${DATA_PATHS.graph}/relationships`),
    ]);
    for(const [key,a] of entries(accounts))addNode(String(a.accountId||a.id||key),{bankName:a.bankName||'',entityName:a.entityName||'',cluster:a.communityId||null,sourceDataset:a.sourceDataset||''});
    for(const [key,e] of [...entries(graphEdges),...entries(shared)]) {
      const source=String(e.source||e.from||''), target=String(e.target||e.to||'');
      if(!source||!target)continue;
      const type=['transaction','shared_device','shared_ip','shared_location'].includes(e.type)?e.type:'transaction';
      // Shared links require provenance, not a guessed relationship.
      if(type!=='transaction'&&!e.provenance)continue;
      const edgeId=String(e.transactionId||e.edgeId||key);
      addNode(source);addNode(target);
      edges.set(edgeId,{data:{id:edgeId,source,target,type,transactionId:e.transactionId||null,amount:finiteNumber(e.amount),currency:/^[A-Z]{3}$/.test(e.currency||'')?e.currency:null,timestamp:isoTimestamp(e.timestamp),provenance:e.provenance||null,sourceDataset:e.sourceDataset||'',flagged:e.flagged===true}});
    }
    return {nodes:[...nodes.values()],edges:[...edges.values()]};
  });
}
export function getAuditLogs() {
  return load('audit',DATA_PATHS.audit,async()=>{
    if(DEMO_MODE)return [...demoReviews().audit,...mockAuditLogs];
    // New analyst actions are stored atomically with the alert in RTDB.
    let rtdb=[], firestore=[];
    const outcomes=await Promise.allSettled([
      readPath(DATA_PATHS.audit).then(val=>{rtdb=entries(val).map(([key,data])=>normalizeAuditLog(key,data));setDataStatus('RTDB audit',{state:rtdb.length?'ready':'empty',path:DATA_PATHS.audit,count:rtdb.length,mode:'firebase',lastSuccess:new Date().toISOString(),error:null});}),
      (async()=>{await withTimeout(requireSession());const snap=await withTimeout(getDocs(query(collection(fs,'auditLogs'),orderBy('timestamp','desc'),limit(READ_LIMIT))));firestore=snap.docs.map(doc=>normalizeAuditLog(doc.id,doc.data()));setDataStatus('Firestore audit',{state:firestore.length?'ready':'empty',path:'auditLogs',count:firestore.length,mode:'firebase',lastSuccess:new Date().toISOString(),error:null});})(),
    ]);
    outcomes.forEach((result,i)=>{if(result.status==='rejected')setDataStatus(i===0?'RTDB audit':'Firestore audit',{state:'error',path:i===0?DATA_PATHS.audit:'auditLogs',mode:'firebase',error:String(result.reason.code||'data/read-failed')});});
    if(outcomes.every(r=>r.status==='rejected'))throw outcomes[0].reason;
    return [...new Map([...firestore,...rtdb].map(log=>[log.id,log])).values()];
  });
}
export async function saveAlertReview(alert, review) {
  const errors=validateReview(review);if(errors.length)throw new Error(errors.join(' '));
  const timestamp=new Date().toISOString();
  const actor=DEMO_MODE?'demo:analyst':(await withTimeout(requireSession())).uid;
  const patch={status:review.status,owner:review.owner.trim(),disposition:review.disposition||'',analystNote:review.note.trim(),reviewedAt:timestamp,reviewedBy:actor};
  const log={id:crypto.randomUUID(),timestamp,alertId:alert.id,transactionId:alert.transactionId,action:'Analyst review recorded',actor,decision:alert.decision,detail:`${review.status}: ${review.note.trim()}`};
  setDataStatus('alert review write',{state:'loading',path:DATA_PATHS.alerts,mode:DEMO_MODE?'demo':'firebase',error:null});
  try {
  if(DEMO_MODE) {
    const state=demoReviews();state.reviews[alert.id]=patch;state.audit.unshift(log);localStorage.setItem(DEMO_REVIEW_KEY,JSON.stringify(state));
  } else {
    const key=push(ref(db,DATA_PATHS.audit)).key;
    const changes={};for(const [field,value]of Object.entries(patch))changes[`${DATA_PATHS.alerts}/${alert.firebaseKey}/${field}`]=value;
    changes[`${DATA_PATHS.audit}/${key}`]={...log,id:key};
    await withTimeout(update(ref(db),changes));
  }
  setDataStatus('alert review write',{state:'ready',lastSuccess:timestamp,error:null});
  } catch(error) { setDataStatus('alert review write',{state:'error',error:String(error.code||'data/write-failed')});throw error; }
  cache.delete('alerts');cache.delete('audit');
  return {...alert,...patch};
}
export function subscribeToUpdates(resource,callback) {
  if(DEMO_MODE)return()=>{};
  let cancelled=false,unsubscribe=()=>{},initial=true,seen=new Set();
  withTimeout(requireSession()).then(()=>{
    if(cancelled)return;
    unsubscribe=onValue(dbQuery(ref(db,DATA_PATHS[resource]||resource),limitToLast(READ_LIMIT)),snapshot=>{
      const current=entries(snapshot.val());
      if(!initial)for(const[key,data]of current)if(!seen.has(key)&&resource==='alerts')callback({type:'new_alert',item:normalizeAlert(key,data)});
      initial=false;seen=new Set(current.map(([key])=>key));cache.delete(resource);
      setDataStatus(`${resource} subscription`,{state:'ready',path:DATA_PATHS[resource]||resource,mode:'firebase',lastSuccess:new Date().toISOString(),error:null});
    },error=>setDataStatus(`${resource} subscription`,{state:'error',error:String(error.code||'data/read-failed'),mode:'firebase'}));
  }).catch(error=>{if(!cancelled)setDataStatus(`${resource} subscription`,{state:'error',error:String(error.code||'auth/session-required'),mode:'firebase'});});
  return()=>{cancelled=true;unsubscribe();};
}
export async function checkDataConnection() {
  clearDataCache();
  await Promise.allSettled([getAlerts(),getTransactions(),getAuditLogs()]);
}
