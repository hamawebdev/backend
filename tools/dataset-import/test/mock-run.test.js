'use strict';

// End-to-end: the CLI against the in-memory API, on the real-data fixture.

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createMockApi } = require('./mock-api');

const TOOL = path.join(__dirname, '..', 'import.js');
const DATASET = path.join(__dirname, 'fixtures', 'dataset');
const EMAIL = 'importer@example.test';
const PASSWORD = 'not-a-real-password';

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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'medadn-import-test-'));
}

const fast = ['--min-delay-ms', '0', '--max-delay-ms', '20'];

test('a --sample run imports everything, a second run sends no question payload', async (t) => {
  const api = createMockApi({ email: EMAIL, password: PASSWORD });
  const base = await api.start();
  const dir = tmpDir();
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const state = path.join(dir, 'state.jsonl');
  const args = (n) => ['--dataset', DATASET, '--api', base, '--sample', '--state', state, '--report', path.join(dir, `report-${n}.json`), ...fast];

  const first = await runCli(args(1));
  assert.strictEqual(first.code, 0, first.output);
  const report1 = JSON.parse(fs.readFileSync(path.join(dir, 'report-1.json'), 'utf8'));
  const planned = report1.plan.totals.questions;
  assert.ok(planned >= 25, `sample has ${planned} questions`);
  assert.strictEqual(api.db.questions.size, planned);
  assert.strictEqual(api.counters.questionPayloads, planned);
  assert.strictEqual(report1.phases.questions.created, planned);
  assert.strictEqual(api.db.exams.size, 1);
  const exam = [...api.db.exams.values()][0];
  assert.ok(exam.questionKeys.every((k) => api.db.questions.has(k)), 'every exam question was imported');
  assert.strictEqual(api.db.media.size, report1.plan.totals.images);
  assert.ok(api.db.media.size > 0);
  assert.strictEqual(report1.reconciliation.mismatches, 0);
  assert.strictEqual(report1.failureCount, 0, JSON.stringify(report1.failures));
  assert.strictEqual(api.counters.logins, 1, 'logs in once');
  // Every question references only hierarchy entries that exist
  for (const q of api.db.questions.values()) {
    if (q.courseKey) assert.ok(api.db.courses.has(q.courseKey));
    for (const url of [...q.questionImages, ...q.explanationImages]) assert.ok(api.db.media.has(url.split('/').pop()), url);
  }
  // Credentials never reach the output or the report
  assert.ok(!first.output.includes(PASSWORD));
  assert.ok(!fs.readFileSync(path.join(dir, 'report-1.json'), 'utf8').includes(PASSWORD));

  const payloadsBefore = api.counters.questionPayloads;
  const uploadsBefore = api.counters.uploads;
  const callsBefore = api.calls.length;
  const second = await runCli(args(2));
  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.counters.questionPayloads, payloadsBefore, 'second run sends no question payload');
  assert.strictEqual(api.counters.uploads, uploadsBefore, 'second run uploads no image');
  const report2 = JSON.parse(fs.readFileSync(path.join(dir, 'report-2.json'), 'utf8'));
  assert.strictEqual(report2.phases.questions.skippedUnchanged, planned);
  assert.strictEqual(report2.phases.exams.skippedUnchanged, 1);
  const secondRoutes = api.calls.slice(callsBefore).map((c) => c.route);
  assert.ok(!secondRoutes.includes('PUT /admin/import/exams'), 'unchanged exams are not re-sent');
  assert.ok(!secondRoutes.includes('POST /admin/import/media'), 'no upload');

  // Without the state file the API is asked for the hashes and still nothing is re-sent
  fs.rmSync(state);
  const third = await runCli(args(3));
  assert.strictEqual(third.code, 0, third.output);
  assert.strictEqual(api.counters.questionPayloads, payloadsBefore);
  assert.ok(api.calls.some((c) => c.route === 'POST /admin/import/questions/state'));
  const report3 = JSON.parse(fs.readFileSync(path.join(dir, 'report-3.json'), 'utf8'));
  assert.strictEqual(report3.phases.questions.knownFromApi, planned);
});

test('a changed translation re-sends only that question', async (t) => {
  const api = createMockApi({ email: EMAIL, password: PASSWORD });
  const base = await api.start();
  const dir = tmpDir();
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // Work on a copy of the fixture so one file can change
  const dataset = path.join(dir, 'dataset');
  fs.cpSync(DATASET, dataset, { recursive: true });
  const state = path.join(dir, 'state.jsonl');
  const args = (n) => ['--dataset', dataset, '--api', base, '--sample', '--state', state, '--report', path.join(dir, `report-${n}.json`), ...fast];
  assert.strictEqual((await runCli(args(1))).code, 0);

  const file = path.join(dataset, 'oran/externat/year-3/unite-appareil-neurologique-locomoteur-et-cutane/physiopathologie-de-la-douleur/2020.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const q = data.questions[0];
  assert.ok(!q.en, 'fixture question has no translation yet');
  q.en = { questionText: 'Translated later', answers: q.answers.map((a) => ({ answerText: `EN ${a.answerText}` })), model: 'test', translatedAt: '2026-09-28T00:00:00Z' };
  fs.writeFileSync(file, JSON.stringify(data));

  const before = api.counters.questionPayloads;
  const second = await runCli(args(2));
  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.counters.questionPayloads - before, 1);
  const stored = api.db.questions.get(q.uid);
  assert.strictEqual(stored.questionTextEn, 'Translated later');
  assert.strictEqual(stored.answers[0].answerTextEn, `EN ${q.answers[0].answerText}`);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'report-2.json'), 'utf8'));
  assert.strictEqual(report.phases.questions.updated, 1);
});

test('retries 5xx/429 with the same payload and refreshes an expired token', async (t) => {
  const api = createMockApi({
    email: EMAIL,
    password: PASSWORD,
    faults: {
      'PUT /admin/import/questions': [500, 503],
      'POST /admin/import/media/check': [429],
      'PUT /admin/import/hierarchy': [502],
    },
    expireTokensAtCall: 6,
  });
  const base = await api.start();
  const dir = tmpDir();
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const res = await runCli(['--dataset', DATASET, '--api', base, '--sample', '--state', path.join(dir, 's.jsonl'), '--report', path.join(dir, 'r.json'), ...fast]);
  assert.strictEqual(res.code, 0, res.output);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'r.json'), 'utf8'));
  assert.strictEqual(api.db.questions.size, report.plan.totals.questions);
  assert.ok(report.api.retries >= 4, `retries ${report.api.retries}`);
  assert.ok(report.api.slow >= 4, 'backs off on errors');
  assert.strictEqual(api.counters.refreshes, 1, 'refreshes the token after a 401');
  assert.strictEqual(api.counters.logins, 1);
  assert.strictEqual(report.reconciliation.mismatches, 0);
});

test('reconciliation mismatch exits 3, wrong credentials exit 1', async (t) => {
  const api = createMockApi({ email: EMAIL, password: PASSWORD });
  const base = await api.start();
  const dir = tmpDir();
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const common = ['--dataset', DATASET, '--api', base, '--sample', '--state', path.join(dir, 's.jsonl'), ...fast];
  assert.strictEqual((await runCli([...common, '--report', path.join(dir, 'a.json')])).code, 0);
  // A question disappears on the server: full-mode equality is broken for the sample totals
  api.db.questions.delete([...api.db.questions.keys()][0]);
  const res = await runCli([...common, '--report', path.join(dir, 'b.json'), '--phases', 'reconcile']);
  assert.strictEqual(res.code, 3, res.output);
  assert.match(res.output, /MISMATCH/);

  const bad = await runCli([...common, '--report', path.join(dir, 'c.json')], { IMPORT_PASSWORD: 'wrong' });
  assert.strictEqual(bad.code, 1);
  assert.match(bad.output, /login failed/);
});

test('--dry-run sends no request and needs no credentials', async (t) => {
  const api = createMockApi({ email: EMAIL, password: PASSWORD });
  const base = await api.start();
  const dir = tmpDir();
  t.after(async () => {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const res = await runCli(['--dataset', DATASET, '--api', base, '--sample', '--dry-run', '--state', path.join(dir, 's.jsonl'), '--report', path.join(dir, 'r.json')], { IMPORT_EMAIL: '', IMPORT_PASSWORD: '' });
  assert.strictEqual(res.code, 0, res.output);
  assert.strictEqual(api.calls.length, 0);
  assert.ok(!fs.existsSync(path.join(dir, 's.jsonl')), 'dry run writes no state');
  assert.match(res.output, /Sample coverage/);
});
