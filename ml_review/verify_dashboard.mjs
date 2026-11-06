// Check actual Python exports against the website's existing data normalizers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {normalizeTransaction,normalizeAlert} from '../src/lib/dataContracts.js';
const run=resolve(process.argv[2] || 'ml_review/results/final_demo');
const load=name=>JSON.parse(readFileSync(resolve(run,`${name}.json`),'utf8'));
const txs=load('transactions'),alerts=load('alerts'),networks=load('networks'),graph=load('graphData');
for(const [key,data] of Object.entries(txs)){
 const t=normalizeTransaction(key,data);
 assert.equal(t.id,key);assert.ok(t.timestamp);assert.notEqual(t.fromAccount,'Not supplied');assert.notEqual(t.toAccount,'Not supplied');assert.ok(Number.isFinite(t.amount));assert.ok(t.currency);assert.equal(t.datasetLabel,null);
}
for(const [key,data] of Object.entries(alerts)){
 const a=normalizeAlert(key,data);
 assert.equal(a.id,key);assert.ok(txs[a.transactionId]);assert.ok(a.timestamp && a.evaluatedAt);assert.equal(a.ruleScore,null);assert.ok(a.shapExplanation.topFeatures.length>0);assert.equal(a.signals.gnn,null);assert.equal(a.modelVersion,'xgb_temporal_v3');
}
for(const n of networks){
 assert.equal(n.scope,'network');assert.ok(n.edges.length>=2 && n.edges.length<=48);assert.equal(n.edges.filter(e=>e.transactionId===n.seedTransactionId).length,1);
 for(const e of n.edges){assert.ok(txs[e.transactionId]);assert.ok(graph.edges[e.transactionId]);assert.equal(graph.edges[e.transactionId].flagged,txs[e.transactionId].decision==='flag');}
}
console.log(`Dashboard contracts passed: ${Object.keys(txs).length} transactions, ${Object.keys(alerts).length} alerts, ${networks.length} networks.`);
