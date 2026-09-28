'use strict';

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { attributePaper, resolveExamYear, buildExam } = require('../lib/exams');
const { loadDataset } = require('../lib/dataset');
const { assignKeys } = require('../lib/hierarchy');

// Headers of real module exam papers: the re-attributed ones, the ones without a year, a few ordinary ones
const PAPERS = require('./fixtures/exam-papers.json');
const NAMES = { alger: 'Alger', constantine: 'Constantine', batna: 'Batna' };

const byName = (pattern) => PAPERS.filter((p) => pattern.test(p.name));
const asPaper = (header) => ({ path: header.path, data: { ...header, questions: [] } });

test('Militaire papers (including the "Miliatire" typo) are Alger with Militaire in the title', () => {
  const papers = byName(/mili/i);
  assert.strictEqual(papers.length, 9);
  for (const header of papers) {
    const a = attributePaper(header);
    assert.deepStrictEqual([a.university, a.militaire], ['alger', true], header.name);
    const exam = buildExam(asPaper(header), { byUid: new Map(), universityNames: NAMES });
    assert.strictEqual(exam.payload.universityKey, 'univ:alger');
    assert.match(exam.payload.title, /Militaire/);
    assert.doesNotMatch(exam.payload.title, /Miliatire/);
  }
});

test('Constantine and Batna papers are re-attributed; pharmacy and ordinary papers stay Alger', () => {
  const constantine = byName(/constantine/i);
  const batna = byName(/batna/i);
  assert.strictEqual(constantine.length, 3);
  assert.strictEqual(batna.length, 1);
  for (const h of constantine) {
    const exam = buildExam(asPaper(h), { byUid: new Map(), universityNames: NAMES, papers: [] });
    assert.strictEqual(exam.payload.universityKey, 'univ:constantine', h.name);
    assert.match(exam.payload.title, /Constantine/);
  }
  for (const h of batna) assert.strictEqual(buildExam(asPaper(h), { byUid: new Map(), universityNames: NAMES }).payload.universityKey, 'univ:batna');
  for (const h of byName(/pharmacie/i)) assert.strictEqual(attributePaper(h).university, 'alger');
  for (const h of PAPERS.filter((p) => !/mili|constantine|batna/i.test(p.name))) {
    assert.deepStrictEqual(attributePaper(h), { university: 'alger', militaire: false, reattributed: false }, h.name);
  }
});

test('exam year: examYear, else academic year in the name, else the questions, else the module', () => {
  assert.deepStrictEqual(resolveExamYear({ examYear: 2019, academicYear: '2018-2019' }, []), { year: 2019, from: 'examYear' });
  const unit02 = PAPERS.find((p) => p.name === 'Examen unité 02 20/21');
  assert.strictEqual(resolveExamYear(unit02, []).year, 2021);
  const rattrapage = PAPERS.find((p) => p.name === 'U03 Rattrapage');
  const fromQuestions = resolveExamYear(rattrapage, [2024, 2025, 2025, undefined]);
  assert.deepStrictEqual([fromQuestions.year, fromQuestions.estimated], [2025, true]);
  const uei2 = PAPERS.find((p) => p.name === 'UEI2 appareil digestif');
  const fromModule = resolveExamYear(uei2, [undefined], [2023, 2025, 2025]);
  assert.deepStrictEqual([fromModule.year, fromModule.estimated], [2025, true]);
  assert.strictEqual(resolveExamYear(uei2, [], []).year, null);

  const built = buildExam(asPaper(uei2), { byUid: new Map(), universityNames: NAMES, papers: [asPaper({ ...uei2, path: 'x', examYear: 2024 })] });
  assert.strictEqual(built.payload.year, 2024);
  assert.match(built.payload.description, /estimée/);
  const noYear = buildExam(asPaper(uei2), { byUid: new Map(), universityNames: NAMES, papers: [] });
  assert.match(noYear.error, /no exam year/);
});

test('exam payload from the fixture paper: module, level and questions in paper order', () => {
  const dataset = loadDataset(path.join(__dirname, 'fixtures', 'dataset'));
  assignKeys(dataset);
  const paper = dataset.papers.find((p) => p.path === 'alger/exams/year-6/dermatologie/2024-p4.json');
  const shuffled = { ...paper, data: { ...paper.data, questions: [...paper.data.questions].reverse() } };
  const exam = buildExam(shuffled, dataset);
  assert.deepStrictEqual(exam.payload, {
    sourceKey: 'exam:alger/exams/year-6/dermatologie/2024-p4.json',
    title: paper.data.name,
    moduleKey: 'module:year-6:dermatologie',
    universityKey: 'univ:alger',
    yearLevel: 'SIX',
    year: 2024,
    questionKeys: paper.data.questions.map((e) => e.ref || e.uid),
  });
  assert.ok(paper.data.questions.some((e) => e.ref) && paper.data.questions.some((e) => !e.ref));
  for (const key of exam.payload.questionKeys) assert.ok(dataset.byUid.has(key), key);
});
