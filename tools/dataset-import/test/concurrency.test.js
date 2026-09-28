'use strict';

// Concurrency, error storms, shared token refresh and the verify phase, end to end:
// the CLI against the in-memory API on the real-data fixture.

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createMockApi } = require('./mock-api');
const { loadDataset } = require('../lib/dataset');
const { selectRecords, buildPlan } = require('../lib/plan');

const TOOL = path.join(__dirname, '..', 'import.js');
const DATASET = path.join(__dirname, 'fixtures', 'dataset');
const EMAIL = 'importer@example.test';
const PASSWORD = 'not-a-real-password';
const fast = ['--max-delay-ms', '30', '--progress-sec', '0'];
const READ_ROUTES = new Set(['POST /auth/login', 'POST /admin/import/questions/state', 'POST /admin/import/media/check', 'GET /admin/import/stats']);

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TOOL, ...args], {
      env: { ...process.env, IMPORT_EMAIL: EMAIL, IMPORT_PASSWORD: PASSWORD, ...env },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ code, output }));
  });
}

function lastLine(output) {
  return output.trim().split('\n').pop();
}

function planOf(mode) {
  const dataset = loadDataset(DATASET);
  return buildPlan(dataset, selectRecords(dataset, mode));
}

async function setup(t, mockOptions = {}) {
  const api = createMockApi({ email: EMAIL, password: PASSWORD, ...mockOptions });
  const base = await api.start();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medadn-import-conc-'));
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const state = path.join(dir, 'state.jsonl');
  const args = (mode, n, extra = []) => ['--dataset', DATASET, '--api', base, `--${mode}`, '--state', state, '--report', path.join(dir, `report-${n}.json`), ...fast, ...extra];
  const report = (n) => JSON.parse(fs.readFileSync(path.join(dir, `report-${n}.json`), 'utf8'));
  return { api, base, dir, state, args, report };
}

function span(api, route) {
  const calls = api.calls.filter((c) => c.route === route);
  assert.ok(calls.length, `no call of ${route}`);
  return { first: Math.min(...calls.map((c) => c.at)), last: Math.max(...calls.map((c) => c.end)) };
}

test('question batches and image uploads run in parallel; every result lands, batches and phases stay in order', async (t) => {
  const latency = { 'PUT /admin/import/questions': 80, 'POST /admin/import/media': 60, 'POST /admin/import/questions/state': 30 };
  const { api, state, args, report } = await setup(t, { latencyMs: (route) => latency[route] || 5 });
  const plan = planOf('full');
  const res = await runCli(args('full', 1, ['--batch', '2', '--concurrency', '4', '--image-concurrency', '8']));
  assert.strictEqual(res.code, 0, res.output);
  assert.strictEqual(lastLine(res.output), `VERIFIED: ${plan.questions.length}/${plan.questions.length} questions, ${plan.images.length}/${plan.images.length} images, 1/1 exams match`);

  // Requests overlapped on the server, never more than asked
  assert.strictEqual(api.maxInflight['PUT /admin/import/questions'], 4, JSON.stringify(api.maxInflight));
  assert.strictEqual(api.maxInflight['POST /admin/import/media'], plan.images.length);
  const r = report(1);
  assert.strictEqual(r.api.concurrency.requests.peakInFlight, 4);
  assert.ok(r.api.concurrency.uploads.peakInFlight <= 8);

  // Every question created exactly once, with the id the server gave it in the state
  assert.strictEqual(api.db.questions.size, plan.questions.length);
  assert.strictEqual(api.counters.created, plan.questions.length);
  assert.strictEqual(api.counters.updated, 0);
  assert.strictEqual(api.counters.questionPayloads, plan.questions.length);
  assert.strictEqual(r.phases.questions.created, plan.questions.length);
  const lines = fs.readFileSync(state, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const stateQuestions = new Map(lines.filter((l) => l.type === 'question').map((l) => [l.key, l]));
  assert.strictEqual(stateQuestions.size, plan.questions.length);
  for (const [key, q] of api.db.questions) {
    assert.strictEqual(stateQuestions.get(key).id, q.id, key);
    assert.strictEqual(stateQuestions.get(key).hash, q.contentHash, key);
  }

  // Batches are consecutive slices of the plan, together exactly the plan
  const order = plan.questions.map((i) => i.payload.sourceKey);
  const position = new Map(order.map((k, i) => [k, i]));
  const batches = api.calls.filter((c) => c.route === 'PUT /admin/import/questions').map((c) => c.keys);
  for (const b of batches) b.forEach((k, i) => i && assert.strictEqual(position.get(k), position.get(b[i - 1]) + 1));
  assert.deepStrictEqual(batches.sort((a, b) => position.get(a[0]) - position.get(b[0])).flat(), order);

  // Phases do not overlap: hierarchy, media, questions, exams, verify
  assert.ok(span(api, 'PUT /admin/import/hierarchy').last <= span(api, 'POST /admin/import/media').first);
  assert.ok(span(api, 'POST /admin/import/media').last <= span(api, 'PUT /admin/import/questions').first);
  assert.ok(span(api, 'PUT /admin/import/questions').last <= span(api, 'PUT /admin/import/exams').first);
  assert.ok(span(api, 'PUT /admin/import/exams').last <= span(api, 'GET /admin/import/stats').first);
});

test('a storm of 503/429, dropped connections, lost answers and timeouts: everything imported exactly once', async (t) => {
  const faults = {
    'PUT /admin/import/hierarchy': [502, 'reset'],
    'POST /admin/import/media/check': [429, 503],
    'POST /admin/import/media': [503, 'after:reset', 429],
    'POST /admin/import/questions/state': [503, 'reset'],
    'PUT /admin/import/questions': [503, 429, 'after:503', 'reset', 503, 'after:reset', 502, 500, 429, 503, 'hang:1500', 503],
    'PUT /admin/import/exams': ['after:502'],
    'GET /admin/import/stats': [503],
  };
  const injected = Object.values(faults).reduce((n, list) => n + list.length, 0);
  const { api, args, report } = await setup(t, { faults, latencyMs: (route) => (route === 'PUT /admin/import/questions' ? 20 : 0) });
  const plan = planOf('full');
  const res = await runCli(args('full', 1, ['--batch', '2', '--concurrency', '4', '--retries', '20', '--timeout-ms', '700']));
  assert.strictEqual(res.code, 0, res.output);
  assert.match(lastLine(res.output), /^VERIFIED: 34\/34 questions, 2\/2 images, 1\/1 exams match$/);
  assert.strictEqual(api.db.questions.size, plan.questions.length);
  assert.strictEqual(api.counters.created, plan.questions.length, 'each question created once');
  assert.strictEqual(api.counters.updated, 0, 'no question overwritten');
  assert.ok(api.counters.questionPayloads > plan.questions.length, 'lost answers were re-sent');
  assert.strictEqual(api.db.media.size, plan.images.length);
  assert.strictEqual(api.db.exams.size, 1);
  assert.strictEqual(api.faultsLeft(), 0, 'every injected fault was hit');
  const r = report(1);
  assert.ok(r.api.retries >= injected, `retries ${r.api.retries} < ${injected}`);
  assert.ok(r.api.throttles >= 1, 'concurrency was reduced');
  assert.ok(r.api.concurrency.requests.lowest <= 2, JSON.stringify(r.api.concurrency));
  assert.strictEqual(r.failureCount, 0, JSON.stringify(r.failures));
  assert.match(res.output, /concurrency reduced to requests [12]\/4/);
  assert.match(res.output, /request timed out/);
});

test('an expired token under parallel requests is refreshed once, every request carries on', async (t) => {
  const { api, args } = await setup(t, {
    latencyMs: (route) => (route === 'PUT /admin/import/questions' ? 60 : 0),
    expireTokensOn: { route: 'PUT /admin/import/questions', n: 6 },
  });
  const res = await runCli(args('full', 1, ['--batch', '1', '--concurrency', '4']));
  assert.strictEqual(res.code, 0, res.output);
  assert.ok(api.counters.unauthorized >= 2, `only ${api.counters.unauthorized} request(s) saw the expired token`);
  assert.strictEqual(api.counters.refreshes, 1, 'a single refresh');
  assert.strictEqual(api.counters.logins, 1, 'no second login');
  assert.strictEqual(api.counters.created, 34);
  assert.match(lastLine(res.output), /^VERIFIED: /);
});

test('verify finds a missing and a mismatched question, a missing image and exam links, and repairs exactly those', async (t) => {
  const { api, args, report } = await setup(t);
  const plan = planOf('sample');
  const n = plan.questions.length;
  const first = await runCli(args('sample', 1));
  assert.strictEqual(first.code, 0, first.output);
  assert.strictEqual(lastLine(first.output), `VERIFIED: ${n}/${n} questions, ${plan.images.length}/${plan.images.length} images, 1/1 exams match`);

  // Losses the state file cannot know about
  const exam = [...api.db.exams.values()][0];
  const missingKey = exam.questionKeys[0];
  api.db.questions.delete(missingKey);
  const staleKey = [...api.db.questions.keys()].find((k) => !exam.questionKeys.includes(k));
  const stale = api.db.questions.get(staleKey);
  const staleId = stale.id;
  stale.contentHash = 'stale';
  stale.questionText = 'an older version';
  const lostImage = [...api.db.media.keys()][0];
  api.db.media.delete(lostImage);
  const before = { ...api.counters };

  const second = await runCli(args('sample', 2));
  assert.strictEqual(second.code, 0, second.output);
  assert.match(second.output, new RegExp(`questions missing on the server: ${missingKey}`));
  assert.match(second.output, new RegExp(`questions with another contentHash on the server: ${staleKey}`));
  assert.match(second.output, new RegExp(`images missing on the server: ${lostImage.replace('.', '\\.')}`));
  assert.match(second.output, /exam-question links 2\/3 \(MISMATCH\)/);
  assert.strictEqual(lastLine(second.output), `VERIFIED: ${n}/${n} questions, ${plan.images.length}/${plan.images.length} images, 1/1 exams match`);
  assert.strictEqual(api.counters.questionPayloads - before.questionPayloads, 2, 'only the two broken questions are sent');
  assert.strictEqual(api.counters.created - before.created, 1);
  assert.strictEqual(api.counters.updated - before.updated, 1);
  assert.strictEqual(api.counters.uploads - before.uploads, 1, 'only the lost image is uploaded');
  assert.strictEqual(api.counters.examWrites - before.examWrites, 1, 'the exam gets its link back');
  assert.strictEqual(api.db.questions.get(staleKey).id, staleId, 'an update keeps the question id');
  assert.notStrictEqual(api.db.questions.get(staleKey).contentHash, 'stale');
  assert.ok(api.db.questions.has(missingKey));
  assert.ok(api.db.media.has(lostImage));
  const r = report(2);
  assert.deepStrictEqual(r.phases.verify.initial, { questionsMissing: 1, questionsMismatched: 1, imagesMissing: 1, examsUnacknowledged: 0, examCountOk: true, examLinksOk: false });
  assert.strictEqual(r.phases.verify.repairRounds, 1);
  assert.strictEqual(r.phases.verify.verified, true);
  assert.strictEqual(r.phases.questions.skippedUnchanged, n, 'the state trusted everything before the verification');

  // The verify phase alone: the exam disappeared
  api.db.exams.clear();
  const third = await runCli(args('sample', 3, ['--phases', 'verify']));
  assert.strictEqual(third.code, 0, third.output);
  assert.strictEqual(api.db.exams.size, 1);
  assert.match(lastLine(third.output), /^VERIFIED: /);
  const routes = new Set(api.calls.slice(-20).map((c) => c.route));
  assert.ok(routes.has('PUT /admin/import/exams'));
});

test('an item the server keeps refusing: bounded repairs, exit 4, the key is printed', async (t) => {
  const plan = planOf('sample');
  const exam = plan.exams[0].payload.questionKeys;
  const refused = plan.questions.map((i) => i.payload.sourceKey).find((k) => !exam.includes(k));
  const { api, args, report } = await setup(t, { rejectKeys: [refused] });
  const res = await runCli(args('sample', 1));
  assert.strictEqual(res.code, 4, res.output);
  assert.strictEqual(api.counters.rejectedPayloads, 1 + 3, 'sent once, then once per repair round');
  const tail = res.output.slice(res.output.lastIndexOf('NOT VERIFIED'));
  assert.match(tail, new RegExp(`^NOT VERIFIED: ${plan.questions.length - 1}/${plan.questions.length} questions`));
  assert.match(tail, new RegExp(`1 question\\(s\\) missing: ${refused}`));
  const r = report(1);
  assert.deepStrictEqual(r.phases.verify.unverified.questionsMissing, [refused]);
  assert.strictEqual(r.phases.verify.verified, false);
});

test('a second run sends nothing but the verification reads', async (t) => {
  const { api, args, report } = await setup(t);
  const first = await runCli(args('full', 1, ['--batch', '5']));
  assert.strictEqual(first.code, 0, first.output);
  const before = { ...api.counters };
  const callsBefore = api.calls.length;
  const second = await runCli(args('full', 2, ['--batch', '5']));
  assert.strictEqual(second.code, 0, second.output);
  const routes = api.calls.slice(callsBefore).map((c) => c.route);
  for (const route of routes) assert.ok(READ_ROUTES.has(route), `second run sent ${route}`);
  assert.deepStrictEqual(api.counters, { ...before, logins: before.logins + 1 });
  assert.ok(routes.includes('POST /admin/import/questions/state') && routes.includes('POST /admin/import/media/check') && routes.includes('GET /admin/import/stats'));
  const r = report(2);
  assert.strictEqual(r.phases.hierarchy.skippedUnchanged, true);
  assert.strictEqual(r.phases.questions.skippedUnchanged, 34);
  assert.strictEqual(r.phases.exams.skippedUnchanged, 1);
  assert.match(lastLine(second.output), /^VERIFIED: 34\/34 questions, 2\/2 images, 1\/1 exams match$/);
});

test('a second import on the same state file is refused while the first one runs', async (t) => {
  const { args, state } = await setup(t);
  fs.writeFileSync(`${state}.lock`, JSON.stringify({ pid: process.pid, host: os.hostname(), since: 'now' }));
  const res = await runCli(args('sample', 1));
  assert.strictEqual(res.code, 1, res.output);
  assert.match(res.output, /in use by another import/);
  assert.ok(!fs.existsSync(state), 'nothing written');
});

test('progress lines give done/total, rate, ETA, concurrency and retries', async (t) => {
  const { args } = await setup(t, { latencyMs: (route) => (route === 'PUT /admin/import/questions' ? 150 : 0) });
  const res = await runCli([...args('full', 1, ['--batch', '1', '--concurrency', '2']), '--progress-sec', '0.2']);
  assert.strictEqual(res.code, 0, res.output);
  const lines = res.output.split('\n').filter((l) => l.startsWith('[progress] questions'));
  assert.ok(lines.length >= 3, lines.join('\n'));
  assert.match(lines[0], /^\[progress\] questions \d+\/34 questions, [\d.]+\/s, \d+m\d\ds elapsed, (ETA \d+m\d\ds|ETA \?) \| concurrency requests 2\/2, uploads 8\/8 \| retries 0 \| requests \d+$/);
  assert.match(lines[lines.length - 1], /questions 34\/34 questions, .*, done \|/);
});

test('interrupted mid-run: the requests in flight finish and are recorded, a re-run sends only the rest', async (t) => {
  const { api, state, args } = await setup(t, { latencyMs: (route) => (route === 'PUT /admin/import/questions' ? 100 : 0) });
  const child = spawn(process.execPath, [TOOL, ...args('full', 1, ['--batch', '1', '--concurrency', '4'])], {
    env: { ...process.env, IMPORT_EMAIL: EMAIL, IMPORT_PASSWORD: PASSWORD },
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const closed = new Promise((resolve) => child.on('close', resolve));
  while (api.counters.created < 8) await new Promise((r) => setTimeout(r, 10));
  child.kill('SIGINT');
  const code = await closed;
  assert.strictEqual(code, 130, output);
  assert.match(output, /Stopping after the requests in flight/);
  assert.ok(api.db.questions.size < 34, 'stopped before the end');
  const acknowledged = new Map();
  for (const line of fs.readFileSync(state, 'utf8').trim().split('\n')) {
    const e = JSON.parse(line);
    if (e.type === 'question') acknowledged.set(e.key, e);
  }
  // What the server holds is exactly what the state acknowledges: nothing in flight was lost
  assert.deepStrictEqual([...acknowledged.keys()].filter((k) => acknowledged.get(k).hash).sort(), [...api.db.questions.keys()].sort());
  assert.ok(!fs.existsSync(`${state}.lock`), 'lock released');

  const again = await runCli(args('full', 2, ['--batch', '1', '--concurrency', '4']));
  assert.strictEqual(again.code, 0, again.output);
  assert.strictEqual(api.counters.questionPayloads, 34, 'no question sent twice');
  assert.strictEqual(api.counters.created, 34);
  assert.match(lastLine(again.output), /^VERIFIED: 34\/34 questions/);
});

test('an exam total re-sending cannot fix: exams re-sent once, then NOT VERIFIED with the counts, exit 4', async (t) => {
  const { api, args } = await setup(t);
  assert.strictEqual((await runCli(args('full', 1))).code, 0);
  // An imported exam this dataset does not have (another import, a renamed paper)
  api.db.exams.set('exam:elsewhere', { sourceKey: 'exam:elsewhere', questionKeys: [], linkedIds: [], id: 99999 });
  const callsBefore = api.calls.length;
  const res = await runCli(args('full', 2));
  assert.strictEqual(res.code, 4, res.output);
  const examPuts = api.calls.slice(callsBefore).filter((c) => c.route === 'PUT /admin/import/exams').length;
  assert.strictEqual(examPuts, 1, 'every exam re-sent once, not once per round');
  assert.match(res.output, /the server holds 2 imported exams, the dataset 1/);
  assert.match(res.output, /NOT VERIFIED: 34\/34 questions, 2\/2 images, 1\/1 exams match/);
});
