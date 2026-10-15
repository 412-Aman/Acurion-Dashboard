import test from 'node:test';
import assert from 'node:assert/strict';
import {dataErrorDetails} from '../src/lib/dataStatus.js';
import {NAV_ITEMS} from '../src/lib/navigation.js';
import {orderedDestinations} from '../src/lib/workspaceMap.js';

test('unverified access failures direct users to verify instead of suggesting administrator approval alone',()=>{
  for(const code of ['auth/email-unverified','database/permission-denied']){
    const detail=dataErrorDetails({code},{user:{emailVerified:false},path:'auditLogs'});
    assert.equal(detail.href,'verify-email.html');assert.match(detail.message,/email is not verified/);assert.equal(detail.retry,false);
  }
});
test('a verified account denied a read gets the exact source and approval steps without claiming a known cause',()=>{
  const detail=dataErrorDetails({code:'database/permission-denied'},{user:{emailVerified:true},path:'auditLogs'});
  assert.match(detail.message,/\/auditLogs/);assert.match(detail.message,/approvedUsers/);assert.match(detail.message,/read permission/);
  assert.doesNotMatch(detail.message,/not signed in|email is not verified/);assert.equal(detail.href,'system.html#access-help');
});
test('permission-denied review writes differ from uncertain writes on a timeout',()=>{
  const denied=dataErrorDetails({code:'PERMISSION_DENIED'},{operation:'write',user:{emailVerified:true}});
  assert.equal(denied.title,'Review was not saved');assert.match(denied.message,/both the alert and audit paths/);assert.equal(denied.retry,false);
  const timeout=dataErrorDetails({code:'data/timeout'},{operation:'write'});
  assert.equal(timeout.title,'Save could not be confirmed');assert.match(timeout.message,/before saving again/);assert.equal(timeout.retry,false);
});
test('signed-out and expired sessions offer different explanations, without leaking raw responses',()=>{
  assert.match(dataErrorDetails({code:'auth/session-required'}).message,/not signed in/);
  assert.match(dataErrorDetails({code:'auth/user-token-expired'}).message,/Sign out and sign in again/);
  const unknown=dataErrorDetails({message:'private secret token',code:'secret?token=private'});
  assert.doesNotMatch(JSON.stringify(unknown),/private|secret/);
});
test('workspace order accepts only unique known routes and keeps new destinations accessible',()=>{
  const ordered=orderedDestinations(NAV_ITEMS,['reports.html','reports.html','https://evil.invalid',null,'alerts.html']);
  assert.deepEqual(ordered.slice(0,2).map(item=>item.href),['reports.html','alerts.html']);
  assert.equal(ordered.length,NAV_ITEMS.length);assert.equal(new Set(ordered.map(item=>item.href)).size,NAV_ITEMS.length);
  for(const malformed of [null,{},'alerts.html'])assert.deepEqual(orderedDestinations(NAV_ITEMS,malformed),NAV_ITEMS);
});
