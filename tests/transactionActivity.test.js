import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionActivity} from '../src/lib/transactionActivity.js';

test('transaction activity counts the loaded records by UTC day without inventing activity on other days',()=>{
  const activity=transactionActivity([{timestamp:'2026-10-14T23:30:00-04:00'},{timestamp:'2026-10-15T12:00:00Z'},{timestamp:'2026-10-13T12:00:00Z'}]);
  assert.deepEqual(activity.days,[{date:'2026-10-13',count:1},{date:'2026-10-15',count:2}]);
  assert.equal(activity.represented,3);assert.equal(activity.endDate,'2026-10-15');assert.equal(activity.missing,0);
});
test('empty or undated samples stay empty, rather than generating a sample calendar',()=>{
  for(const records of [[],[{timestamp:null}],[{timestamp:''},{timestamp:'invalid date'}]]){
    const activity=transactionActivity(records);assert.deepEqual(activity.days,[]);assert.equal(activity.endDate,null);assert.equal(activity.missing,records.length);assert.equal(activity.represented,0);
  }
});
test('missing timestamps and dated records outside the calendar are reported separately',()=>{
  const activity=transactionActivity([{timestamp:'2026-10-15T00:00:00Z'},{timestamp:'2020-01-01T00:00:00Z'},{timestamp:null}]);
  assert.equal(activity.missing,1);assert.equal(activity.outsideWindow,1);assert.equal(activity.represented,1);
  assert.equal(activity.represented+activity.missing+activity.outsideWindow,3);
  assert.equal(new Date(`${activity.startDate}T00:00:00Z`).getUTCDay(),0);
});
test('a day at the calendar boundary is included and a record before it is not',()=>{
  const calendar=transactionActivity([{timestamp:'2026-10-15T00:00:00Z'}]);
  const before=new Date(Date.parse(`${calendar.startDate}T00:00:00Z`)-86400000).toISOString();
  const activity=transactionActivity([{timestamp:'2026-10-15T00:00:00Z'},{timestamp:`${calendar.startDate}T00:00:00Z`},{timestamp:before}]);
  assert.equal(activity.represented,2);assert.equal(activity.outsideWindow,1);assert.equal(activity.days[0].date,calendar.startDate);
});
