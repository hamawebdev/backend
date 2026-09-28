'use strict';

// The API client on its own: concurrency limits, backoff, shared token refresh.

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ApiClient, Lane, backoffDelay, retryableStatus } = require('../lib/api');
const { runPool, fromList } = require('../lib/pool');
const { StateStore } = require('../lib/state');
const { createMockApi } = require('./mock-api');

const EMAIL = 'importer@example.test';
const PASSWORD = 'not-a-real-password';

// A fetch that answers from a script: each call takes the next status (default 200)
function scriptedFetch(statuses, { delayMs = 5 } = {}) {
  const state = { calls: 0, active: 0, peak: 0 };
  const fetch = async () => {
    state.calls++;
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    await new Promise((r) => setTimeout(r, delayMs));
    state.active--;
    const status = statuses.length ? statuses.shift() : 200;
    return { status, headers: new Map(), text: async () => JSON.stringify({ success: status < 400, data: { ok: true } }) };
  };
  return { fetch, state };
}

function client(fetch, extra = {}) {
  const api = new ApiClient({ baseUrl: 'http://api.test/api/v1', email: EMAIL, password: PASSWORD, fetch, maxDelayMs: 5, random: () => 0.5, ...extra });
  // no login needed for these calls
  api.accessToken = 'x.eyJleHAiOjk5OTk5OTk5OTl9.y';
  api.expiresAt = 9999999999000;
  return api;
}

test('backoff: exponential, jittered between half and all of the step, capped', () => {
  assert.strictEqual(backoffDelay(1, 1000, 60000, () => 0), 500);
  assert.strictEqual(backoffDelay(1, 1000, 60000, () => 1), 1000);
  assert.strictEqual(backoffDelay(3, 1000, 60000, () => 0.5), 3000);
  assert.strictEqual(backoffDelay(20, 1000, 60000, () => 1), 60000);
  assert.ok(backoffDelay(20, 1000, 60000, () => 0) >= 30000);
  for (const s of [408, 429, 500, 502, 503, 504]) assert.ok(retryableStatus(s), String(s));
  for (const s of [200, 400, 401, 403, 404, 413, 422]) assert.ok(!retryableStatus(s), String(s));
});

test('a lane never lets more than its limit run, and serves waiters in order', async () => {
  const lane = new Lane('t', 3);
  const order = [];
  let active = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 10 }, async (_, i) => {
    await lane.acquire();
    order.push(i);
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    lane.release();
  }));
  assert.strictEqual(peak, 3);
  assert.deepStrictEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  lane.setLimit(1);
  assert.strictEqual(lane.limit, 1);
  lane.setLimit(99);
  assert.strictEqual(lane.limit, 3);
});

test('errors halve the concurrency (not below 1), successes after a quiet period bring it back one step at a time', async () => {
  const { fetch, state } = scriptedFetch([503, 503, 503, 503, 503, 503]);
  const api = client(fetch, { concurrency: 8, reduceIntervalMs: 0, recoverAfterMs: 0 });
  await Promise.all(Array.from({ length: 6 }, () => api.request('GET', '/x')));
  assert.strictEqual(api.lanes.default.lowest, 1, 'halved down to 1');
  assert.ok(api.stats.throttles >= 3);
  assert.strictEqual(api.stats.retries, 6);
  const limitAfterErrors = api.lanes.default.limit;
  // 1 -> 8 takes 2 * (1 + 2 + ... + 7) = 56 successes
  for (let i = 0; i < 56; i++) await api.request('GET', '/x');
  assert.ok(api.lanes.default.limit > limitAfterErrors, 'recovered');
  assert.strictEqual(api.lanes.default.limit, 8, 'back to the configured maximum');
  assert.ok(api.stats.recoveries >= 3);
  assert.ok(state.peak <= 8);
});

test('latency alone does not throttle below --slow-ms; above it, it does', async () => {
  const slowFetch = scriptedFetch([], { delayMs: 30 });
  const patient = client(slowFetch.fetch, { concurrency: 4, slowMs: 1000 });
  await Promise.all(Array.from({ length: 8 }, () => patient.request('GET', '/x')));
  assert.strictEqual(patient.lanes.default.limit, 4);
  assert.strictEqual(patient.stats.throttles, 0);
  const strict = client(scriptedFetch([], { delayMs: 30 }).fetch, { concurrency: 4, slowMs: 10 });
  await Promise.all(Array.from({ length: 4 }, () => strict.request('GET', '/x')));
  assert.ok(strict.lanes.default.limit < 4);
  assert.ok(strict.stats.slowAnswers >= 1);
});

test('retries give up after --retries with a retryable error; a 4xx is not retried', async () => {
  const api = client(scriptedFetch([503, 503, 503]).fetch, { retries: 2 });
  await assert.rejects(api.request('GET', '/x'), (e) => e.retryable && /failed after 2 retries/.test(e.message));
  const refused = client(scriptedFetch([400]).fetch);
  await assert.rejects(refused.request('GET', '/x'), (e) => e.status === 400 && !e.retryable);
  assert.strictEqual(refused.stats.retries, 0);
});

test('parallel requests that all meet an expired token share one refresh', async (t) => {
  const mock = createMockApi({ email: EMAIL, password: PASSWORD, latencyMs: 20 });
  const base = await mock.start();
  t.after(() => mock.stop());
  const api = new ApiClient({ baseUrl: base, email: EMAIL, password: PASSWORD, concurrency: 8, maxDelayMs: 5 });
  await api.login();
  mock.expireTokens();
  const results = await Promise.all(Array.from({ length: 16 }, () => api.request('GET', '/admin/import/stats')));
  assert.strictEqual(results.length, 16);
  assert.ok(mock.counters.unauthorized >= 2, `${mock.counters.unauthorized} 401(s)`);
  assert.strictEqual(mock.counters.refreshes, 1);
  assert.strictEqual(mock.counters.logins, 1);

  // A token close to expiry is refreshed ahead of time, once, however many requests wait
  api.expiresAt = Date.now() + 1000;
  api.refreshMarginMs = 60000;
  await Promise.all(Array.from({ length: 12 }, () => api.request('GET', '/admin/import/stats')));
  assert.strictEqual(mock.counters.refreshes, 2);
  assert.strictEqual(mock.counters.logins, 1);
});

test('short-lived tokens are not refreshed on every request', async (t) => {
  const mock = createMockApi({ email: EMAIL, password: PASSWORD, accessTtlSec: 20 });
  const base = await mock.start();
  t.after(() => mock.stop());
  const api = new ApiClient({ baseUrl: base, email: EMAIL, password: PASSWORD });
  await api.login();
  for (let i = 0; i < 5; i++) await api.request('GET', '/admin/import/stats');
  assert.strictEqual(mock.counters.refreshes, 0);
});

test('pool: tasks start in order, at most size at once, the first error stops the rest', async () => {
  const started = [];
  let active = 0;
  let peak = 0;
  await runPool({
    size: 3,
    next: fromList([1, 2, 3, 4, 5, 6, 7]),
    worker: async (n) => {
      started.push(n);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 3));
      active--;
    },
  });
  assert.deepStrictEqual(started, [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(peak, 3);
  const ran = [];
  await assert.rejects(runPool({
    size: 2,
    next: fromList([1, 2, 3, 4, 5, 6]),
    worker: async (n) => {
      ran.push(n);
      await new Promise((r) => setTimeout(r, 2));
      if (n === 2) throw new Error('boom');
    },
  }), /boom/);
  assert.ok(ran.length < 6, `ran ${ran}`);
});

test('state lock: refused while held, a stale lock is taken over, released on unlock', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medadn-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.jsonl');
  const a = new StateStore(file).lock();
  assert.throws(() => new StateStore(file).lock(), /in use by another import/);
  a.unlock();
  assert.ok(!fs.existsSync(`${file}.lock`));
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2147483646, host: os.hostname(), since: 'long ago' }));
  const b = new StateStore(file).lock();
  assert.strictEqual(JSON.parse(fs.readFileSync(`${file}.lock`, 'utf8')).pid, process.pid);
  b.unlock();
  // read-only (dry run) never locks
  new StateStore(file, { readOnly: true }).lock();
  assert.ok(!fs.existsSync(`${file}.lock`));
  // verify bookkeeping: missing images are not acknowledged, putIfChanged skips equal entries
  const s = new StateStore(file);
  s.put('image', 'a.png', { url: '/x' });
  s.put('image', 'b.png', { missing: true });
  assert.ok(s.acknowledged('image', 'a.png'));
  assert.ok(!s.acknowledged('image', 'b.png'));
  assert.strictEqual(s.putIfChanged('image', 'a.png', { url: '/x' }), false);
  assert.strictEqual(s.putIfChanged('image', 'a.png', { url: '/y' }), true);
});
