import { loadWorkspace, saveWorkspace } from './complianceStore.js';
import { validateCase, POLICY_VERSION } from './amlEngine.js';
export function createCaseFromAlert(alert,transaction,relatedTransactions=[]) {
  if(!transaction)throw new Error('Load the referenced transaction before creating a demo case.');
  const state=loadWorkspace();
  const existing=state.cases.find(c=>c.alertIds?.includes(alert.id)&&c.status!=='closed');
  if(existing)return existing.id;
  const evidenceIds=new Set([transaction.id,...(alert.evidenceTransactionIds||[])]);
  const transactions=[...new Map([transaction,...relatedTransactions.filter(tx=>evidenceIds.has(tx.id))].map(tx=>[tx.id,tx])).values()];
  const record={id:`CASE-${crypto.randomUUID().slice(0,8)}`,customerId:transaction.fromAccount,transactionIds:transactions.map(tx=>tx.id),alertIds:[alert.id],status:'draft',reportType:'STR',jurisdiction:'AE',owner:alert.owner||'',narrative:'',grounds:alert.reason||'Review the source alert and record grounds for suspicion.',createdAt:new Date().toISOString(),legalHold:false,
    sourceEvidence:{mode:'demo',capturedAt:new Date().toISOString(),alert:structuredClone(alert),transactions:structuredClone(transactions),graph:[]}};
  state.cases.unshift(record);
  saveWorkspace(state,'Demo alert escalated to case',`${alert.id} → ${record.id}`);
  return record.id;
}
export function attachGraphEvidence(caseId,evidence) {
  const state=loadWorkspace(),record=state.cases.find(c=>c.id===caseId);
  if(!record)throw new Error('Choose an existing case.');
  if(record.status==='closed')throw new Error('Reopen the case before adding evidence.');
  if(!evidence.edges?.length)throw new Error('Select a path or account neighborhood first.');
  record.graphEvidence ||= [];
  const fingerprint=evidence.edges.map(e=>e.id).sort().join('|');
  if(record.graphEvidence.some(e=>e.fingerprint===fingerprint))return;
  record.graphEvidence.push({...structuredClone(evidence),id:crypto.randomUUID(),fingerprint,capturedAt:new Date().toISOString(),sourceMode:'demo'});
  saveWorkspace(state,'Graph evidence attached',`${caseId}: ${evidence.edges.length} relationships`);
}
export function buildCaseReport(state,record) {
  const errors=validateCase(record);if(errors.length)throw new Error(`Complete the case before export: ${errors.join('; ')}`);
  return {schemaVersion:'case-report-1',disclaimer:'Prototype investigation draft with fictional data. Not submitted to a regulator. Not validated goAML XML.',generatedAt:new Date().toISOString(),report:record,
    customer:state.customers.find(c=>c.id===record.customerId)||null,
    transactions:[...new Map([...state.transactions.filter(t=>record.transactionIds.includes(t.id)),...(record.sourceEvidence?.transactions||[])].map(t=>[t.id,t])).values()],
    assessments:state.assessments.filter(a=>record.transactionIds.includes(a.transactionId)),sourceAlert:record.sourceEvidence?.alert||null,
    graphEvidence:record.graphEvidence||[],findings:state.findings.filter(f=>f.entityId===record.customerId||state.transactions.some(t=>record.transactionIds.includes(t.id)&&t.toAccount===f.entityId)),
    documents:state.documents.filter(d=>d.customerId===record.customerId).map(({content,...metadata})=>metadata),
    audit:state.audit.filter(a=>a.detail?.includes(record.id)||record.transactionIds.some(id=>a.detail?.includes(id))),policy:state.policy,policyVersion:POLICY_VERSION,
    analystConclusion:{narrative:record.narrative,grounds:record.grounds},sourceMode:record.sourceEvidence?.mode||'browser-sandbox'};
}
