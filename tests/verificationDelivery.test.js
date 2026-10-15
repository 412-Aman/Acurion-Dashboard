import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerificationDelivery,VERIFICATION_RESEND_MS,VERIFICATION_THROTTLE_MS} from '../src/lib/verificationDelivery.js';
const user={uid:'synthetic-user',emailVerified:false};
function fixture(send) {
  let time=1000;const saved=new Map();
  const settings={send,namespace:'synthetic-project',storage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},now:()=>time};
  return {delivery:createVerificationDelivery(settings),reload:()=>createVerificationDelivery(settings),advance:ms=>{time+=ms;},settings};
}
test('signup and immediate resend share one request; successful cooldown survives page reload',async()=>{
  let sends=0,finish;const f=fixture(()=>{sends++;return new Promise(resolve=>{finish=resolve;});});
  const first=f.delivery.request(user),second=f.delivery.request(user);
  assert.equal(first,second);await Promise.resolve();assert.equal(sends,1);
  assert.equal(f.reload().state(user.uid).status,'sending');
  finish();await first;
  const reloaded=f.reload();assert.equal(reloaded.state(user.uid).status,'sent');assert.equal(reloaded.remaining(user.uid),60);
  await assert.rejects(reloaded.request(user),{code:'auth/verification-cooldown'});assert.equal(sends,1);
  f.advance(VERIFICATION_RESEND_MS);assert.equal(reloaded.remaining(user.uid),0);
});
test('Firebase throttling stays visible across reloads and blocks sends until the local backoff ends',async()=>{
  let sends=0;const f=fixture(async()=>{sends++;throw Object.assign(new Error('limited'),{code:'auth/too-many-requests'});});
  await assert.rejects(f.delivery.request(user),{code:'auth/too-many-requests'});
  const reloaded=f.reload();assert.equal(reloaded.state(user.uid).status,'rate-limited');assert.equal(reloaded.remaining(user.uid),300);
  await assert.rejects(reloaded.request(user),{code:'auth/too-many-requests'});assert.equal(sends,1);
  f.advance(VERIFICATION_THROTTLE_MS);assert.equal(reloaded.remaining(user.uid),0);assert.equal(sends,1); // No automatic retries.
});
test('delivery failures never claim success and allow a deliberate retry after a short wait',async()=>{
  let sends=0;const f=fixture(async()=>{if(++sends===1)throw Object.assign(new Error('offline'),{code:'auth/network-request-failed'});});
  await assert.rejects(f.delivery.request(user),{code:'auth/network-request-failed'});
  assert.equal(f.delivery.state(user.uid).status,'failed');assert.equal(f.delivery.remaining(user.uid),10);
  f.advance(10_000);await f.delivery.request(user);assert.equal(sends,2);assert.equal(f.delivery.state(user.uid).status,'sent');
});
test('cooldowns work without storage and do not leak between accounts or projects',async()=>{
  let sends=0;const f=fixture(async()=>{sends++;});
  const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  const delivery=createVerificationDelivery({...f.settings,storage:broken});
  await delivery.request(user);await assert.rejects(delivery.request(user),{code:'auth/verification-cooldown'});
  await delivery.request({...user,uid:'different-user'});assert.equal(sends,2);
  await f.delivery.request(user);
  const otherProject=createVerificationDelivery({...f.settings,namespace:'different-project'});
  assert.equal(otherProject.remaining(user.uid),0);
});
test('missing sessions and verified accounts never send another verification email',async()=>{
  let sends=0;const f=fixture(async()=>{sends++;});
  await assert.rejects(f.delivery.request(null),{code:'auth/session-required'});
  assert.equal((await f.delivery.request({...user,emailVerified:true})).status,'verified');assert.equal(sends,0);
});
