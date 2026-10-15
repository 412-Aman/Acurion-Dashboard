import test from 'node:test';
import assert from 'node:assert/strict';
import {observePageDataStatus,setDataStatus} from '../src/lib/dataStatus.js';

test('connection notices resume with current source state when a cached page returns',()=>{
  const handlers=new Map(),page={addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener:name=>handlers.delete(name)};
  let updates=0,last=[];
  const dispose=observePageDataStatus(records=>{updates++;last=records;},page);
  setDataStatus('lifecycle source',{state:'ready'});
  assert.equal(last.find(record=>record.resource==='lifecycle source').state,'ready');
  handlers.get('pagehide')({persisted:true});const before=updates;
  setDataStatus('lifecycle source',{state:'error',error:'database/permission-denied'});
  assert.equal(updates,before);
  handlers.get('pageshow')({persisted:true});
  assert.equal(updates,before+1);assert.equal(last.find(record=>record.resource==='lifecycle source').state,'error');
  handlers.get('pageshow')({persisted:true});setDataStatus('lifecycle source',{state:'ready'});
  assert.equal(updates,before+2); // Repeated pageshow must not create duplicate subscriptions.
  handlers.get('pagehide')({persisted:true});handlers.get('pageshow')({persisted:true});
  const resumed=updates;dispose();setDataStatus('lifecycle source',{state:'empty'});
  assert.equal(updates,resumed);assert.equal(handlers.size,0);
});
