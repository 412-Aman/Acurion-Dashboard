import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTransaction,normalizeAlert} from '../src/lib/dataContracts.js';
import {fieldCoverage} from '../src/lib/fieldCoverage.js';
import {connectionState} from '../src/lib/connectionState.js';
test('IEEE raw columns map without turning relative time, card IDs or labels into evidence',()=>{
  const tx=normalizeTransaction('ieee-1',{TransactionID:2987203,TransactionAmt:'29.50',TransactionDT:86400,ProductCD:'W',P_emaildomain:'example.com',card1:123,isFraud:1});
  assert.equal(tx.id,'2987203');assert.equal(tx.amount,29.5);assert.equal(tx.relativeTime,'Dataset second 86400');assert.equal(tx.timestamp,null);assert.equal(tx.currency,null);assert.equal(tx.fromAccount,'Not supplied');assert.equal(tx.riskScore,null);assert.equal(tx.decision,'unassessed');assert.equal(tx.datasetLabel,1);assert.equal(tx.fieldSources.amount,'TransactionAmt');
});
test('PaySim aliases preserve accounts and zero amounts without creating calendar time or currency',()=>{
  const tx=normalizeTransaction('p-1',{nameOrig:'C1',nameDest:'C2',type:'TRANSFER',amount:0,step:0,isFraud:0});
  assert.equal(tx.fromAccount,'C1');assert.equal(tx.toAccount,'C2');assert.equal(tx.channel,'TRANSFER');assert.equal(tx.amount,0);assert.equal(tx.relativeTime,'Dataset hour 0');assert.equal(tx.timestamp,null);assert.equal(tx.currency,null);
});
test('known bank export column names map amounts and currencies while ambiguous Account stays unmapped',()=>{
  const tx=normalizeTransaction('b-1',{'Amount Paid':'100.25','Payment Currency':'US Dollar','From Bank':'B1','To Bank':'B2','Payment Format':'ACH',Timestamp:'2026/10/01 12:00',Account:'123','Account.1':'456'});
  assert.equal(tx.amount,100.25);assert.equal(tx.currency,'USD');assert.equal(tx.fromBank,'B1');assert.equal(tx.channel,'ACH');assert.equal(tx.fromAccount,'Not supplied');assert.equal(tx.toAccount,'Not supplied');
});
test('alert snake case metadata and zero signals survive mapping, canonical values take priority',()=>{
  const alert=normalizeAlert('a-1',{transaction_id:'T1',riskScore:95,risk_score:12,risk_score_scale:'0-100',model_version:'v2',policy_version:'p1',rule_score:0,rule_ids:['R1'],anomaly_score:0,supervised_score:.8,gnn_score:.7,graph_risk_score:0,evaluated_at:'2026-10-01T12:00:00Z'});
  assert.equal(alert.riskScore,.95);assert.equal(alert.modelVersion,'v2');assert.equal(alert.ruleScore,0);assert.deepEqual(alert.signals,{anomaly:0,supervised:.8,gnn:.7,graph:0});assert.equal(alert.timestamp,null);assert.equal(alert.fieldSources.modelVersion,'model_version');
});
test('coverage counts zero as supplied, empty explanations as missing, and records actual aliases',()=>{
  const records=[normalizeAlert('A',{rule_score:0,anomaly_score:0,shapExplanation:[]}),normalizeAlert('B',{})];
  const rows=fieldCoverage(records,'alerts');
  assert.equal(rows.find(r=>r.field==='ruleScore').present,1);assert.equal(rows.find(r=>r.field==='signals.anomaly').missing,1);assert.equal(rows.find(r=>r.field==='shapExplanation').missing,2);assert.deepEqual(rows.find(r=>r.field==='ruleScore').columns,['rule_score']);
  assert.ok(fieldCoverage([],'transactions').every(r=>r.total===0&&r.missing===0));
});
test('connection light handles checking, partial failures, empty reads, transport loss and demo separately',()=>{
  const reads=[{resource:'transactions',state:'ready'},{resource:'alerts',state:'loading'}];
  assert.equal(connectionState(reads).state,'checking');reads[1].state='error';assert.equal(connectionState(reads).state,'disconnected');reads[1].state='empty';assert.equal(connectionState(reads).state,'connected');
  assert.equal(connectionState([...reads,{resource:'alert review write',state:'error'}]).state,'connected');
  assert.equal(connectionState(reads,{online:false}).state,'disconnected');assert.equal(connectionState(reads,{transport:false}).state,'disconnected');assert.equal(connectionState(reads,{transport:null}).state,'checking');assert.equal(connectionState(reads,{demo:true,online:false}).state,'demo');assert.equal(connectionState([]).state,'checking');
});
test('transfer sides never borrow the other side currency',()=>{
  const received=normalizeTransaction('R',{'Amount Received':100,'Receiving Currency':'Euro','Payment Currency':'US Dollar'});
  assert.equal(received.amount,100);assert.equal(received.currency,'EUR');
  const paid=normalizeTransaction('P',{'Amount Paid':100,'Receiving Currency':'Euro'});assert.equal(paid.currency,null);
  const both=normalizeTransaction('B',{'Amount Paid':50,'Payment Currency':'US Dollar','Amount Received':48,'Receiving Currency':'Euro'});assert.equal(both.amount,50);assert.equal(both.currency,'USD');
});
test('nested signals and explicit signal scales map without interpreting target labels',()=>{
  const alert=normalizeAlert('A',{signals:{anomaly:0,supervised:1,gnn:50,graph:4},supervised_score_scale:'0-100',gnn_score_scale:'0-100',isFraud:1});
  assert.deepEqual(alert.signals,{anomaly:0,supervised:.01,gnn:.5,graph:4});assert.equal(alert.riskScore,.01);assert.equal(alert.fieldSources.gnnScore,'signals.gnn');
});
