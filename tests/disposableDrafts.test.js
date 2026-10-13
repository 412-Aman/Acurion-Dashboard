import test from 'node:test';
import assert from 'node:assert/strict';
import {DRAFT_KEY,seedDrafts,readDrafts,saveDrafts,trashDraft,restoreDraft} from '../src/lib/disposableDrafts.js';
test('draft disposal never changes investigation/evidence storage',()=>{
 const evidence=JSON.stringify({cases:[{id:'CASE-1',legalHold:true}],documents:[{id:'DOC-1'}],audit:[{action:'Filed'}]});
 const values=new Map([['acurion.compliance.sandbox.v1',evidence]]);
 const storage={getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,value)};
 const state=readDrafts(storage),next=trashDraft(state,state.items[0].id);saveDrafts(next,storage);
 assert.equal(values.get('acurion.compliance.sandbox.v1'),evidence);
 assert.equal(values.size,2);assert.ok(values.has(DRAFT_KEY));
 assert.equal(state.items.length,3);assert.equal(readDrafts(storage).items.length,2);
});
test('recovery restores the full deleted draft and removes its trash entry',()=>{
 const original=seedDrafts(),draft=original.items[1];
 const deleted=trashDraft(original,draft.id);const recovered=restoreDraft(deleted,draft.id);
 assert.deepEqual(recovered.items.find(d=>d.id===draft.id),draft);assert.equal(recovered.trash.length,0);
});
test('storage failure propagates without changing the current draft state',()=>{
 const state=seedDrafts();const storage={setItem:()=>{throw new Error('Quota exceeded');}};
 assert.throws(()=>saveDrafts(trashDraft(state,state.items[0].id),storage),/Quota exceeded/);
 assert.equal(state.items.length,3);assert.equal(state.trash.length,0);
});
