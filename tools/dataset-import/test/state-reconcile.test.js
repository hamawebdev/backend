'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StateStore } = require('../lib/state');
const { compare, serverView } = require('../lib/reconcile');
const { parseArgs, buildOptions } = require('../import');

test('state file: last line per key wins, torn lines are ignored, compaction keeps one line per key', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medadn-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.jsonl');
  const s1 = new StateStore(file).load();
  assert.strictEqual(s1.loaded, false);
  s1.put('question', 'q_1', { hash: 'a', id: 1 });
  s1.put('question', 'q_1', { hash: 'b', id: 1 });
  s1.put('image', 'x.png', { url: '/api/v1/media/images/x.png' });
  s1.flush();
  fs.appendFileSync(file, '{"type":"question","key":"q_2","ha');
  const s2 = new StateStore(file).load();
  assert.strictEqual(s2.get('question', 'q_1').hash, 'b');
  assert.ok(s2.has('image', 'x.png'));
  assert.ok(!s2.has('question', 'q_2'));
  for (let i = 0; i < 1100; i++) s2.put('question', 'q_1', { hash: String(i) });
  s2.flush();
  assert.strictEqual(s2.compact(), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.strictEqual(new StateStore(file).load().get('question', 'q_1').hash, '1099');

  const readOnly = new StateStore(path.join(dir, 'ro.jsonl'), { readOnly: true });
  readOnly.put('question', 'q', { hash: 'h' });
  readOnly.flush();
  assert.ok(!fs.existsSync(path.join(dir, 'ro.jsonl')));
});

const LOCAL = {
  questions: 5, published: 4, unpublished: 1, withEnglish: 2,
  byUniversity: {
    'univ:setif': { name: 'Sétif', questions: 3, published: 2, unpublished: 1, withEnglish: 2 },
    none: { name: 'Sans université', questions: 2, published: 2, unpublished: 0, withEnglish: 0 },
  },
  bySource: { 'src:setif:residanat': { name: 'Résidanat Sétif', questions: 3, published: 2, unpublished: 1, withEnglish: 2 } },
  byPack: {},
  residency: { 'univ:setif|Biologie': 2, 'univ:setif|none': 1 },
  exams: 1,
  images: 4,
};

// The shape GET /admin/import/stats returns (backend src/modules/import)
const BACKEND_STATS = {
  questions: { total: 5, published: 4, unpublished: 1, withEnglish: 2, notImported: 0 },
  answers: { total: 20, withEnglish: 8 },
  byUniversity: [
    { id: 3, name: 'Sétif', sourceKey: 'univ:setif', total: 3, published: 2 },
    { id: null, name: null, sourceKey: null, total: 2, published: 2 },
  ],
  bySource: [{ id: 1, name: 'Résidanat Sétif', sourceKey: 'src:setif:residanat', total: 3, published: 2 }],
  byStudyPack: [],
  exams: { total: 1, examQuestions: 3, notImported: 0 },
  residency: [
    { universityId: 3, university: 'Sétif', part: 'Biologie', total: 2, published: 2 },
    { universityId: 3, university: 'Sétif', part: null, total: 1, published: 0 },
  ],
  images: { files: 4, questionImages: 3, explanationImages: 1 },
};

test('reconciliation reads the backend stats shape and matches every reported figure', () => {
  const view = serverView(BACKEND_STATS);
  assert.deepStrictEqual(view.totals, { questions: 5, published: 4, unpublished: 1, withEnglish: 2 });
  assert.strictEqual(view.images, 4);
  assert.strictEqual(view.exams, 1);
  const result = compare(LOCAL, BACKEND_STATS, 'full');
  assert.strictEqual(result.mismatches, 0, JSON.stringify(result.rows.filter((r) => r.status === 'MISMATCH')));
  const status = (group, name, metric) => result.rows.find((r) => r.group === group && r.name.includes(name) && r.metric === metric).status;
  assert.strictEqual(status('university', 'Sétif', 'questions'), 'ok');
  assert.strictEqual(status('university', 'Sans université', 'questions'), 'ok');
  assert.strictEqual(status('university', 'Sétif', 'withEnglish'), 'n/a');
  assert.strictEqual(status('residency', 'univ:setif|none', 'count'), 'ok');
});

test('reconciliation flags differences; sample mode only needs the server to hold the sample', () => {
  const more = JSON.parse(JSON.stringify(BACKEND_STATS));
  more.questions.total = 6;
  more.questions.published = 5;
  assert.ok(compare(LOCAL, more, 'full').mismatches >= 2);
  assert.strictEqual(compare(LOCAL, more, 'sample').mismatches, 0);
  const fewer = JSON.parse(JSON.stringify(BACKEND_STATS));
  fewer.residency[0].total = 1;
  assert.strictEqual(compare(LOCAL, fewer, 'sample').mismatches, 1);
});

test('CLI options: mode, credentials from the environment, validation', () => {
  const env = { IMPORT_EMAIL: 'a@b.c', IMPORT_PASSWORD: 'pw' };
  const o = buildOptions(parseArgs(['--dataset', '/d', '--api', 'https://x/api/v1', '--sample', '--batch=50', '--min-delay-ms', '0']), env);
  assert.strictEqual(o.mode, 'sample');
  assert.strictEqual(o.batch, 50);
  assert.strictEqual(o.minDelayMs, 0);
  assert.strictEqual(o.password, 'pw');
  assert.throws(() => buildOptions(parseArgs(['--dataset', '/d', '--api', 'x']), env), /--sample or --full/);
  assert.throws(() => buildOptions(parseArgs(['--dataset', '/d', '--api', 'x', '--full']), {}), /IMPORT_EMAIL/);
  assert.throws(() => buildOptions(parseArgs(['--dataset', '/d', '--api', 'x', '--full', '--batch', '500']), env), /--batch/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.strictEqual(buildOptions(parseArgs(['--dataset', '/d', '--dry-run']), {}).mode, 'full');
});
