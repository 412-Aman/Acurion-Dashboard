import test from 'node:test';
import assert from 'node:assert/strict';
const events=new Map(), navigations=[];
let reduce=false,resolveExit,animations=0,updates=0;
const region={getAnimations:()=>[],animate:()=>{animations++;let reject;const finished=new Promise((resolve,fail)=>{resolveExit=resolve;reject=fail;});return {finished,cancel:()=>reject(new Error('cancelled'))};}};
globalThis.matchMedia=()=>({matches:reduce});
globalThis.CSS={supports:()=>true};
globalThis.window={addEventListener:(name,handler)=>events.set(name,handler)};
globalThis.document={querySelector:()=>region,getElementById:()=>null,addEventListener:(name,handler)=>events.set(name,handler)};
globalThis.location={href:'https://acurion.example/index.html',origin:'https://acurion.example',assign:href=>navigations.push(href),replace:href=>navigations.push(href)};
const {navigateSmoothly,transitionView}=await import('../src/lib/motion.js');
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('rapid fallback navigation clicks take the latest destination with one animation',async()=>{
  navigateSmoothly('alerts.html');navigateSmoothly('graph.html');
  events.get('pageshow')({persisted:false}); // Initial page load must not cancel an early click.
  assert.equal(animations,1);resolveExit();await flush();
  assert.deepEqual(navigations,['https://acurion.example/graph.html']);
  events.get('pageshow')({persisted:true});
});
test('reduced motion navigates immediately and performs view updates once without animation',async()=>{
  reduce=true;const before=animations;
  navigateSmoothly('reports.html');await transitionView(()=>updates++);
  assert.equal(animations,before);assert.equal(updates,1);assert.equal(navigations.at(-1),'https://acurion.example/reports.html');reduce=false;
});
test('restoring a cached page cancels pending fallback navigation so it cannot reopen an obsolete route',async()=>{
  const before=navigations.length;navigateSmoothly('compliance.html?view=customers');events.get('pageshow')({persisted:true});await flush();assert.equal(navigations.length,before);
});
test('a local view selection cancels an earlier page exit and keeps the latest view interactive',async()=>{
  const before=navigations.length;navigateSmoothly('alerts.html');
  await transitionView(()=>updates++);await flush();
  assert.equal(navigations.length,before);assert.equal(updates,2);
});
test('modified clicks and external links retain their native browser behavior',()=>{
  let prevented=false;const listener=events.get('click');
  listener({defaultPrevented:false,button:0,metaKey:true,target:{closest:()=>({href:'https://acurion.example/alerts.html'})},preventDefault:()=>{prevented=true;}});
  listener({defaultPrevented:false,button:0,target:{closest:()=>({href:'https://external.example/alerts.html',hasAttribute:()=>false,target:'',dataset:{}})},preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,false);
});
