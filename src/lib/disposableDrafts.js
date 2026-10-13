// A separate, recoverable working-draft store. Never writes AML case/evidence records.
export const DRAFT_KEY = 'acurion.disposable-drafts.v1';
export function seedDrafts() {
  return { version:1, items:[
    { id:'sample-outline', name:'Customer review outline', size:'Working note', body:'Fictional example: summarise the customer profile, expected activity and grounds for review.' },
    { id:'sample-scenario', name:'Scenario tuning notes', size:'Working note', body:'Fictional example: compare threshold and repeated transfer scenarios before approving a policy.' },
    { id:'sample-format', name:'Report formatting trial', size:'Working note', body:'Fictional example: prepare a narrative outline. This is not an STR, SAR or an investigation record.' },
  ], trash:[] };
}
export function readDrafts(storage = localStorage) {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return seedDrafts();
  const state = JSON.parse(raw);
  if(state.version !== 1 || !Array.isArray(state.items) || !Array.isArray(state.trash)) throw new Error('Working drafts could not be loaded.');
  return state;
}
export function saveDrafts(state, storage = localStorage) { storage.setItem(DRAFT_KEY,JSON.stringify(state)); return state; }
export function trashDraft(state,id) {
  const item = state.items.find(d => d.id === id);
  if(!item) throw new Error('This working draft is no longer available.');
  return { ...state, items:state.items.filter(d => d.id !== id), trash:[{...item,deletedAt:new Date().toISOString()},...state.trash] };
}
export function restoreDraft(state,id) {
  const item = state.trash.find(d => d.id === id);
  if(!item) throw new Error('This draft is not in the recovery tray.');
  const {deletedAt,...draft}=item;
  return {...state,items:[draft,...state.items],trash:state.trash.filter(d=>d.id!==id)};
}
