import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTransaction, customerRisk, screenEntity, defaultPolicy, retentionUntil, validateCase } from '../src/lib/amlEngine.js';
const customer = { id: 'C1', currency: 'AED', monthlyIncome: 10000, threshold: 50000, expectedMonthly: 40000, pep: 'none', kyc: 'verified' };
const transaction = { id: 'T1', fromAccount: 'C1', amount: 60000, currency: 'AED', timestamp: '2026-10-01T12:00:00Z' };
test('income and threshold independently flag with explanations', () => {
  const result = assessTransaction(transaction, customer, [transaction]);
  assert.equal(result.decision, 'flag');
  assert.ok(result.reasons.some(r => r.code === 'THRESHOLD'));
  assert.ok(result.reasons.some(r => r.code === 'INCOME'));
});
test('repeated bulk window excludes future, old, other-customer and foreign-currency transfers', () => {
  const history = [transaction, { ...transaction, id: 'T2', timestamp: '2026-09-29T12:00:00Z' }, { ...transaction, id: 'T3', timestamp: '2026-09-28T12:00:00Z' }];
  assert.ok(assessTransaction(transaction, customer, history).reasons.some(r => r.code === 'BULK'));
  for (const patch of [{ timestamp: '2026-10-02T12:00:00Z' }, { timestamp: '2026-08-01T12:00:00Z' }, { currency: 'USD' }, { fromAccount: 'C2' }]) {
    assert.ok(!assessTransaction(transaction, customer, [transaction, history[1], { ...history[2], ...patch }]).reasons.some(r => r.code === 'BULK'));
  }
});
test('potential name match is flagged; analyst-confirmed sanction blocks; false positive has no effect', () => {
  const hit = { kind: 'sanction', disposition: 'pending' };
  const tx = { ...transaction, amount: 100 };
  assert.equal(assessTransaction(tx, customer, [tx], defaultPolicy, [hit]).decision, 'flag');
  assert.equal(assessTransaction(tx, customer, [tx], defaultPolicy, [{ ...hit, disposition: 'confirmed' }]).decision, 'block');
  assert.equal(assessTransaction(tx, customer, [tx], defaultPolicy, [{ ...hit, disposition: 'false_positive' }]).decision, 'pass');
});
test('PEP / media findings trigger review rather than automatic blocking', () => {
  const tx = { ...transaction, amount: 100 };
  assert.equal(assessTransaction(tx, { ...customer, pep: 'family' }, [tx]).decision, 'flag');
  assert.equal(assessTransaction(tx, customer, [tx], defaultPolicy, [{ kind: 'adverse_media', disposition: 'confirmed', severity: 'major' }]).decision, 'flag');
  assert.ok(customerRisk({ ...customer, pep: 'associate' }).score >= 60);
});
test('FX and missing customer profile cannot silently pass', () => {
  assert.ok(assessTransaction({ ...transaction, currency: 'USD' }, customer, []).reasons.some(r => r.code === 'FX_REQUIRED'));
  assert.equal(assessTransaction(transaction, null, []).decision, 'flag');
});
test('name matching handles accents and aliases but never confirms automatically', () => {
  const records = [{ id: 'S1', name: 'Jose Example', aliases: ['Example Alias'], kind: 'sanction', identifier: 'ID1' }];
  const hit = screenEntity({ name: 'José Example', identifier: 'ID1' }, records)[0];
  assert.equal(hit.corroborated, true); assert.equal(hit.disposition, 'pending');
  assert.equal(screenEntity({ name: 'Example Alias' }, records).length, 1);
  assert.equal(screenEntity({ name: '' }, records).length, 0);
});
test('scores change when screening is resolved and remain capped', () => {
  const hit = { entityId: 'C1', kind: 'sanction', disposition: 'confirmed' };
  assert.equal(customerRisk(customer, [], [hit]).score, 100);
  assert.equal(customerRisk(customer, [], [{ ...hit, disposition: 'false_positive' }]).score, 0);
});
test('open records and legal holds have no disposal date; completed records use closure anchor', () => {
  assert.equal(retentionUntil({ createdAt: '2020-01-01' }, 5), null);
  assert.equal(retentionUntil({ closedAt: '2026-10-12T00:00:00Z', legalHold: true }, 5), null);
  assert.equal(retentionUntil({ closedAt: '2026-10-12T00:00:00Z' }, 5), '2031-10-12T00:00:00.000Z');
});
test('report drafts need transaction, ownership, jurisdiction and narrative', () => {
  assert.ok(validateCase({}).length > 0);
  assert.deepEqual(validateCase({ customerId: 'C1', owner: 'Analyst', jurisdiction: 'AE', narrative: 'Facts', grounds: 'Reasons', transactionIds: ['T1'] }), []);
});
test('latest relevant retention event extends retention; open case remains ineligible', () => {
  const record = { status: 'closed', closedAt: '2026-10-12T00:00:00Z', finalJudgmentAt: '2028-01-01T00:00:00Z' };
  assert.equal(retentionUntil(record, 5), '2033-01-01T00:00:00.000Z');
  assert.equal(retentionUntil({ ...record, status: 'investigating' }, 5), null);
});
