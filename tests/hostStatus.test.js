import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostStatus, canStart, canPause, canControlDesk, describeK7, newRecentAlerts, STALE_MS } from '../src/lib/hostStatus.js';

const NOW = 1_800_000_000_000;
const running = { updatedAt: NOW - 1000, bridge: '1.0.0',
  k7: { state: 'running', sent: 7850, total: 213995, speed: 110.8, alerts: 1, watch: 117, payment_time: '2022-10-26T23:06:00Z', model: 'Acurion K7 (real-time laundering model, rt/core)', dataset: 'HI-Large',
    recent: { 0: { alertId: 'al_6t', accountId: '16938:80634EB90', riskScore: 0.9681, severity: 'high', timestamp: '2022-10-26T23:05:00Z', reason: "K7's alert list: First payment from this sender to this receiver" } } },
  uploads: { state: 'ready' } };

test('a fresh status is online with progress, counts and the newest alerts (Firebase lists arrive as objects)', () => {
  const status = normalizeHostStatus(running, NOW);
  assert.equal(status.connection, 'online');
  assert.equal(status.k7.state, 'running');
  assert.equal(status.k7.progress, 7850 / 213995);
  assert.equal(status.k7.recent.length, 1);
  assert.equal(status.k7.recent[0].reason, 'First payment from this sender to this receiver');
  assert.equal(status.uploads.state, 'ready');
  assert.ok(canPause(status) && !canStart(status));
});

test('a status older than the stale limit, or a stopped bridge, means the host is offline', () => {
  assert.equal(normalizeHostStatus({ ...running, updatedAt: NOW - STALE_MS - 1 }, NOW).connection, 'stale');
  assert.equal(normalizeHostStatus({ ...running, stopped: true }, NOW).connection, 'stale');
  const stale = normalizeHostStatus({ ...running, updatedAt: NOW - STALE_MS - 1 }, NOW);
  assert.equal(stale.k7.state, 'offline'); assert.equal(stale.uploads.state, 'offline');
  assert.ok(!canStart(stale) && !canPause(stale));
});

test('missing, loading and signed-out states never claim the host is available', () => {
  assert.equal(normalizeHostStatus(null, NOW).connection, 'never');
  assert.equal(normalizeHostStatus(undefined, NOW).connection, 'loading');
  assert.equal(normalizeHostStatus(running, NOW, { signedIn: false }).connection, 'signed-out');
  assert.match(describeK7(normalizeHostStatus(running, NOW, { signedIn: false })), /signed-in investigator/);
});

test('Start is offered only when K7 is ready or paused, and only reviewers and admins control it', () => {
  for (const [state, start] of [['ready', true], ['paused', true], ['getting ready', false], ['finished', false], ['failed', false]])
    assert.equal(canStart(normalizeHostStatus({ ...running, k7: { ...running.k7, state } }, NOW)), start, state);
  assert.deepEqual(['viewer', 'analyst', 'reviewer', 'admin'].map(canControlDesk), [false, false, true, true]);
});

test('unknown values from the host are made safe', () => {
  const status = normalizeHostStatus({ updatedAt: NOW, k7: { state: 'exploded', sent: 'x', total: 0, recent: [{ alertId: 'a', riskScore: 7 }, { riskScore: 0.5 }] }, uploads: { state: 'weird' } }, NOW);
  assert.equal(status.k7.state, 'offline'); assert.equal(status.k7.progress, 0); assert.equal(status.uploads.state, 'offline');
  assert.equal(status.k7.recent.length, 1); assert.equal(status.k7.recent[0].riskScore, null);
});

test('new alerts are found by ID, and nothing is new on the first look', () => {
  const a = [{ alertId: '1' }], b = [{ alertId: '2' }, { alertId: '1' }];
  assert.deepEqual(newRecentAlerts(null, b), []);
  assert.deepEqual(newRecentAlerts(a, b), [{ alertId: '2' }]);
});
