import test from 'node:test';
import assert from 'node:assert/strict';
import {emailActionSettings} from '../src/lib/emailActionSettings.js';
test('local email requests omit the optional return URL so loopback authorization cannot reject them',()=>{
  for(const host of ['localhost','127.0.0.1','127.0.0.2','[::1]','app.localhost','0.0.0.0']) {
    assert.equal(emailActionSettings('verify-email.html',`http://${host}:5173/signup.html`),undefined);
    assert.equal(emailActionSettings('login.html',`http://${host}:5173/forgot-password.html`),undefined);
  }
});
test('deployed email requests retain the configured site and base path without old query parameters',()=>{
  assert.deepEqual(emailActionSettings('verify-email.html','https://acurion.example/app/signup.html?next=reports.html'),{url:'https://acurion.example/app/verify-email.html'});
  assert.deepEqual(emailActionSettings('login.html','https://acurion.example/forgot-password.html#old'),{url:'https://acurion.example/login.html'});
});
