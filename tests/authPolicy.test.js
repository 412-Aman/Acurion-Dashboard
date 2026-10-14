import test from 'node:test';
import assert from 'node:assert/strict';
import { authSettings,validateRegistration,safeReturnPath,requiresEmailVerification,authErrorMessage } from '../src/lib/authPolicy.js';

test('registration rejects mismatched, short, oversized and malformed account input',()=>{
  const valid={name:'Demo Analyst',email:'analyst@example.com',password:'a valid long passphrase',confirmation:'a valid long passphrase'};
  assert.deepEqual(validateRegistration(valid),[]);
  for(const patch of [{name:''},{name:true},{email:'bad email'},{password:'short',confirmation:'short'},{confirmation:'different'},{password:'x'.repeat(129),confirmation:'x'.repeat(129)}])assert.ok(validateRegistration({...valid,...patch}).length);
});
test('auth return destinations reject external URLs and non-workspace routes',()=>{
  const origin='https://acurion.example';
  for(const value of ['https://evil.example/alerts.html','//evil.example/alerts.html','javascript:alert(1)','/signup.html','/unknown.html'])assert.equal(safeReturnPath(value,origin),'index.html');
  assert.equal(safeReturnPath('compliance.html?view=cases&case=CASE-1',origin),'compliance.html?view=cases&case=CASE-1');
  assert.equal(safeReturnPath('/reports.html#draft-tray',origin),'reports.html#draft-tray');
});
test('deferred auth flags stay off unless explicitly enabled',()=>{
  const disabled=authSettings({});assert.equal(disabled.enabled,false);assert.equal(disabled.registration,false);assert.ok(Object.values(disabled.providers).every(value=>value===false));
  const enabled=authSettings({VITE_AUTH_ENABLED:'true',VITE_AUTH_GOOGLE_ENABLED:'true',VITE_AUTH_GITHUB_ENABLED:'true',VITE_AUTH_APPLE_ENABLED:'false'});
  assert.equal(enabled.providers.google,true);assert.equal(enabled.providers.github,true);assert.equal(enabled.providers.apple,false);assert.equal(enabled.registration,false);
});
test('unverified password accounts require verification; OAuth and verified users do not receive a false verification gate',()=>{
  assert.equal(requiresEmailVerification({emailVerified:false,providerData:[{providerId:'password'}]}),true);
  assert.equal(requiresEmailVerification({emailVerified:true,providerData:[{providerId:'password'}]}),false);
  assert.equal(requiresEmailVerification({emailVerified:false,providerData:[{providerId:'github.com'}]}),false);
  assert.equal(requiresEmailVerification(null),false);
});
test('auth errors do not reveal account existence, credentials or arbitrary server details',()=>{
  assert.equal(authErrorMessage({code:'auth/user-not-found'}),authErrorMessage({code:'auth/wrong-password'}));
  assert.match(authErrorMessage({code:'auth/account-exists-with-different-credential'}),/original provider/);
  assert.match(authErrorMessage({code:'auth/expired-action-code'}),/expired/);
  assert.doesNotMatch(authErrorMessage({code:'unknown',message:'secret token value'}),/secret|token/);
});
