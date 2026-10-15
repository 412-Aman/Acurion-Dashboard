import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuditSources} from '../src/lib/auditSources.js';
test('Realtime Database audit makes one read with no legacy query or duplicate status rows by default',async()=>{
  let reads=0,legacyReads=0,statuses=0;const records=[{id:'AUDIT-1'}];
  const result=await readAuditSources({readRealtime:async()=>{reads++;return records;},readLegacy:async()=>{legacyReads++;throw new Error('unused');},onStatus:()=>{statuses++;}});
  assert.equal(result,records);assert.equal(reads,1);assert.equal(legacyReads,0);assert.equal(statuses,0);
});
test('an empty RTDB audit remains empty without consulting an unconfigured backend',async()=>{
  let legacyReads=0;
  assert.deepEqual(await readAuditSources({readRealtime:async()=>[],readLegacy:async()=>{legacyReads++;return [{id:'unrelated'}];}}),[]);
  assert.equal(legacyReads,0);
});
test('a denied RTDB audit remains a real failure without silent fallback',async()=>{
  const denied=new Error('Permission denied');let legacyReads=0;
  await assert.rejects(readAuditSources({readRealtime:async()=>{throw denied;},readLegacy:async()=>{legacyReads++;return [];}}),error=>error===denied);
  assert.equal(legacyReads,0);
});
test('explicit legacy mode reports partial failure while preserving available RTDB records',async()=>{
  const statuses=new Map(),records=[{id:'AUDIT-1'}];
  const result=await readAuditSources({legacyEnabled:true,readRealtime:async()=>records,readLegacy:async()=>{throw Object.assign(new Error('timeout'),{code:'data/timeout'});},onStatus:(name,state)=>statuses.set(name,state)});
  assert.deepEqual(result,records);assert.equal(statuses.get('RTDB audit').state,'ready');assert.equal(statuses.get('Firestore audit').error,'data/timeout');
});
test('explicit legacy mode deduplicates records with RTDB priority and fails if both sources fail',async()=>{
  const result=await readAuditSources({legacyEnabled:true,readRealtime:async()=>[{id:'same',value:'current'}],readLegacy:async()=>[{id:'same',value:'legacy'},{id:'old'}]});
  assert.deepEqual(result,[{id:'same',value:'current'},{id:'old'}]);
  const denied=new Error('Permission denied');
  await assert.rejects(readAuditSources({legacyEnabled:true,readRealtime:async()=>{throw denied;},readLegacy:async()=>{throw new Error('unavailable');}}),error=>error===denied);
});
