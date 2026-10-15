import test from 'node:test';
import assert from 'node:assert/strict';
import {dataErrorCode,describeDataError,setDataStatus,getDataStatus} from '../src/lib/dataStatus.js';
test('plain RTDB permission rejections retain their meaning in saved source diagnostics',()=>{
  for(const error of [new Error('Permission denied'),new Error('permission_denied'),{code:'PERMISSION_DENIED'},{code:'permission-denied'}]) {
    const code=dataErrorCode(error);assert.equal(code,'database/permission-denied');assert.match(describeDataError(error),/denied access/);
    setDataStatus('synthetic denied source',{state:'error',error:code});
    const saved=getDataStatus().find(record=>record.resource==='synthetic denied source');
    assert.match(describeDataError({code:saved.error}),/denied access/);
  }
});
test('network, timeout, index and configuration failures remain distinct from empty records',()=>{
  assert.equal(dataErrorCode(new Error('Client is offline.')),'data/network-error');
  assert.equal(dataErrorCode({code:'data/timeout'}),'data/timeout');
  assert.equal(dataErrorCode(new Error('Index not defined, add an index')),'database/index-required');
  assert.equal(dataErrorCode(new Error('Invalid database URL')),'database/configuration-error');
  assert.equal(dataErrorCode({code:'auth/email-unverified'}),'auth/email-unverified');
});
test('unknown failures never persist raw messages, URLs or credentials as diagnostic codes',()=>{
  const error={message:'private customer record and token',code:'https://example.invalid/?token=private'};
  assert.equal(dataErrorCode(error),'data/read-failed');
  assert.equal(dataErrorCode(error,'data/write-failed'),'data/write-failed');
  assert.doesNotMatch(describeDataError(error),/private|token/);
});
