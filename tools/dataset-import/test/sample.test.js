'use strict';

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { loadDataset } = require('../lib/dataset');
const { assignKeys } = require('../lib/hierarchy');
const { selectSample } = require('../lib/sample');

const DATASET = path.join(__dirname, 'fixtures', 'dataset');

function load() {
  const dataset = loadDataset(DATASET);
  assignKeys(dataset);
  return dataset;
}

test('the sample covers every kind of data present in the dataset', () => {
  const dataset = load();
  const { records, papers, coverage } = selectSample(dataset);
  const expected = [
    'single-choice', 'multiple-choice', 'qroc-with-expected-answer', 'qroc-without-expected-answer',
    'question-images', 'explanation-images', 'remote-images', 'english-text-explanation-answer-explanations',
    'residanat-embedded-paper-question', 'unsorted-cramqcm', 'unsorted-mbset', 'unpublished-unknown-type',
    'case-question', 'broken-encoding', 'module-exam-paper-refs-and-embedded',
    'residency-part setif/biologie', 'residency-part setif/medicale', 'residency-part setif/chirurgie',
    'residency-part alger/sciences-fondamentales', 'residency-part alger/pathologie-medico-chirurgicale',
    'residency-part alger/dossier-clinique', 'residency-part oran/no-part', 'residency-part blida/sciences-fondamentales',
  ];
  for (const name of expected) assert.ok(coverage[name], `${name} covered`);
  // every university x kind of the dataset
  const combos = new Set(dataset.records.map((r) => (r.university ? `${r.university}/${r.kind}` : `_unsorted/${r.platform}`)));
  for (const combo of combos) assert.ok(coverage[`university-kind ${combo}`], combo);
  assert.ok(combos.size >= 13);
  // every question named in the coverage is in the sample
  const uids = new Set(records.map((r) => r.uid));
  for (const [name, value] of Object.entries(coverage)) if (value && !name.startsWith('module-exam')) assert.ok(uids.has(value), name);
  // the module exam paper comes with all of its questions, referenced and embedded
  assert.strictEqual(papers.length, 1);
  for (const e of papers[0].data.questions) assert.ok(uids.has(e.ref || e.uid));
  // the fixture has no question with more than 10 explanation images
  assert.strictEqual(coverage['explanation-images-over-10'], null);
});

test('a question with more than 10 explanation images is picked when the dataset has one', () => {
  const dataset = load();
  const fixture = require('./fixtures/questions/over-10-explanation-images.json');
  dataset.records.push({ uid: fixture.question.uid, q: fixture.question, file: fixture.file, pos: 0, view: 'course', university: 'alger', kind: 'externat', tree: 'year', studyYear: fixture.studyYear, module: fixture.module, course: fixture.course, examYear: fixture.examYear });
  const { coverage } = selectSample(dataset);
  assert.strictEqual(coverage['explanation-images-over-10'], fixture.question.uid);
});

test('the sample is deterministic and small', () => {
  const a = selectSample(load());
  const b = selectSample(load());
  assert.deepStrictEqual(a.records.map((r) => r.uid), b.records.map((r) => r.uid));
  assert.ok(a.records.length <= 60);
});
