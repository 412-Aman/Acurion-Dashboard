import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {authSettings} from '../src/lib/authPolicy.js';

// Exercise the real service with fake Firebase popup boundaries; no accounts or requests.
function service(env={}){
  const calls=[],auth={};
  class GoogleAuthProvider {setCustomParameters(value){this.parameters=value;}}
  class GithubAuthProvider {}
  const source=readFileSync(new URL('../src/lib/authService.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport\s+/g,'').replaceAll('import.meta.env','env');
  const api=runInNewContext(`${source}\n({signInProvider});`,{env,auth,authSettings,GoogleAuthProvider,GithubAuthProvider,configurationIssues:[],firebaseConfig:{projectId:'test'},createVerificationDelivery:()=>({}),signInWithPopup:(instance,provider)=>{const result={instance,provider};calls.push(result);return result;}});
  return {api,calls,auth,GoogleAuthProvider,GithubAuthProvider};
}
test('both social sign-in options reach the Firebase popup despite stale false hosting flags',()=>{
  const {api,calls,auth,GoogleAuthProvider,GithubAuthProvider}=service({VITE_AUTH_GOOGLE_ENABLED:'false',VITE_AUTH_GITHUB_ENABLED:'false'});
  api.signInProvider('google');api.signInProvider('github');
  assert.equal(calls.length,2);assert.equal(calls[0].instance,auth);
  assert.ok(calls[0].provider instanceof GoogleAuthProvider);assert.equal(calls[0].provider.parameters.prompt,'select_account');
  assert.ok(calls[1].provider instanceof GithubAuthProvider);
});
test('the global auth pause and unsupported provider IDs still block popup requests',()=>{
  const paused=service({VITE_AUTH_ENABLED:'false'});
  assert.throws(()=>paused.api.signInProvider('google'),{code:'auth/not-configured'});assert.equal(paused.calls.length,0);
  const normal=service();assert.throws(()=>normal.api.signInProvider('unknown'),{code:'auth/unsupported-provider'});assert.equal(normal.calls.length,0);
});
