'use strict';

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { loadDataset } = require('../lib/dataset');
const { assignKeys } = require('../lib/hierarchy');
const { buildQuestionPayload, contentHashOf } = require('../lib/mapping');
const { canonicalJson, sha256 } = require('../lib/util');

const DATASET = path.join(__dirname, 'fixtures', 'dataset');
const dataset = loadDataset(DATASET);
assignKeys(dataset);

const url = (p) => `/api/v1/media/images/${path.basename(p)}`;
const build = (record, imageUrl = url) => buildQuestionPayload(record, { imageUrl });
const find = (predicate, what) => {
  const r = dataset.records.find(predicate);
  assert.ok(r, `fixture has ${what}`);
  return r;
};

test('fixture loads without validation errors', () => {
  assert.deepStrictEqual(dataset.errors, []);
  assert.strictEqual(dataset.records.length, dataset.index.questions.storedOnce);
});

test('single and multiple choice keep their type, answers by position', () => {
  for (const type of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE']) {
    const r = find((x) => x.q.questionType === type && x.q.answers.length > 1 && x.q.answers.some((a) => a.isCorrect), type);
    const { payload } = build(r);
    assert.strictEqual(payload.questionType, type);
    assert.strictEqual(payload.isPublished, true);
    assert.strictEqual(payload.questionText, r.q.questionText);
    assert.deepStrictEqual(payload.answers.map((a) => a.position), r.q.answers.map((_, i) => i));
    assert.deepStrictEqual(payload.answers.map((a) => a.answerText), r.q.answers.map((a) => a.answerText));
    assert.deepStrictEqual(payload.answers.map((a) => a.isCorrect), r.q.answers.map((a) => a.isCorrect === true));
  }
});

test('QROC: the expected answer becomes the one correct answer, with its translation', () => {
  const r = find((x) => x.q.questionType === 'QROC' && x.q.expectedAnswer && x.q.en && x.q.en.expectedAnswer, 'QROC with translated expected answer');
  const { payload } = build(r);
  assert.strictEqual(payload.questionType, 'QROC');
  assert.deepStrictEqual(payload.answers, [{ position: 0, answerText: r.q.expectedAnswer, answerTextEn: r.q.en.expectedAnswer, isCorrect: true }]);
  assert.strictEqual(payload.isPublished, true);

  const without = find((x) => x.q.questionType === 'QROC' && !x.q.expectedAnswer, 'QROC without expected answer');
  const second = build(without).payload;
  assert.deepStrictEqual(second.answers, []);
  assert.strictEqual(second.isPublished, true);
});

test('UNKNOWN type: derived from the origin type and imported unpublished', () => {
  const r = find((x) => x.q.questionType === 'UNKNOWN', 'UNKNOWN question');
  const { payload } = build(r);
  const expected = { qcs: 'SINGLE_CHOICE', qcm: 'MULTIPLE_CHOICE', combinaison: 'MULTIPLE_CHOICE' }[r.q.originType];
  assert.strictEqual(payload.questionType, expected);
  assert.strictEqual(payload.isPublished, false);
  assert.ok(payload.metadata.unpublishedReasons.includes('unknown-type'));
  assert.ok(payload.metadata.unpublishedReasons.includes('no-correct-answer'));
});

test('empty question text: imported as an empty string, unpublished', () => {
  const r = find((x) => !x.q.questionText, 'question without text');
  const { payload } = build(r);
  assert.strictEqual(payload.questionText, '');
  assert.strictEqual(payload.isPublished, false);
  assert.deepStrictEqual(payload.metadata.unpublishedReasons, ['empty-question']);
});

test('a choice question with a single answer is unpublished', () => {
  const r = find((x) => x.q.questionType === 'SINGLE_CHOICE', 'single choice');
  const q = { ...r.q, answers: [r.q.answers.find((a) => a.isCorrect) || r.q.answers[0]] };
  const { payload } = build({ ...r, q });
  assert.strictEqual(payload.isPublished, false);
  assert.ok(payload.metadata.unpublishedReasons.includes('fewer-than-two-answers'));
});

test('English: question, explanation and every answer (text and explanation) stay index-aligned', () => {
  const r = find((x) => x.q.en && x.q.en.explanation && x.q.en.answers.some((a) => a.explanation), 'fully translated question');
  const { payload } = build(r);
  assert.strictEqual(payload.questionTextEn, r.q.en.questionText);
  assert.strictEqual(payload.explanationEn, r.q.en.explanation);
  r.q.answers.forEach((a, i) => {
    assert.strictEqual(payload.answers[i].answerText, a.answerText);
    assert.strictEqual(payload.answers[i].answerTextEn, r.q.en.answers[i].answerText);
    assert.strictEqual(payload.answers[i].explanationEn, r.q.en.answers[i].explanation);
  });
  // A translation with a different answer count is not attached to the wrong answers
  const broken = { ...r.q, en: { ...r.q.en, answers: r.q.en.answers.slice(1) } };
  const second = build({ ...r, q: broken }).payload;
  assert.ok(second.answers.every((a) => a.answerTextEn === undefined && a.explanationEn === undefined));
  assert.strictEqual(second.questionTextEn, r.q.en.questionText);
});

test('residency parts: from the question, or from its paper for embedded questions', () => {
  const setif = find((x) => x.university === 'setif' && x.kind === 'residanat' && x.q.part === 'biologie', 'Sétif biologie');
  const p1 = build(setif).payload;
  assert.strictEqual(p1.metadata.part, 'Biologie');
  assert.strictEqual(p1.universityKey, 'univ:setif');
  assert.strictEqual(p1.questionSourceKey, 'src:setif:residanat');
  assert.match(p1.courseKey, /^course:module:residanat:year-\d:/);
  assert.strictEqual(p1.examYear, setif.examYear);

  const dc = find((x) => x.university === 'alger' && x.paper && x.paper.data.part === 'dossier-clinique', 'Alger dossier clinique paper question');
  const p2 = build(dc).payload;
  assert.strictEqual(p2.metadata.part, 'Dossier_clinique');
  assert.strictEqual(p2.courseKey, undefined);
  assert.strictEqual(p2.universityKey, 'univ:alger');
  assert.strictEqual(p2.questionSourceKey, 'src:alger:residanat');
  assert.strictEqual(p2.examYear, dc.paper.data.examYear);
  assert.strictEqual(p2.yearLevel, undefined);
  assert.strictEqual(p2.metadata.number, dc.paper.n);

  const oran = find((x) => x.university === 'oran' && x.kind === 'residanat', 'Oran résidanat question');
  const p3 = build(oran).payload;
  assert.strictEqual(p3.metadata.part, undefined);
  assert.strictEqual(p3.metadata.month, oran.paper.data.month);
  assert.strictEqual(p3.examYear, oran.paper.data.examYear);
});

test('metadata keeps the documented fields and drops undefined ones', () => {
  const withCase = find((x) => x.q.case, 'case question');
  const m1 = build(withCase).payload.metadata;
  assert.deepStrictEqual(m1.case, withCase.q.case);
  assert.strictEqual(m1.originType, withCase.q.originType);
  assert.deepStrictEqual(m1.origin, withCase.q.origin);
  assert.ok(Object.values(m1).every((v) => v !== undefined && v !== null));

  const inverse = find((x) => x.q.isInverse === true, 'inverse question');
  assert.strictEqual(build(inverse).payload.metadata.isInverse, true);

  const remote = find((x) => (x.q.remoteImages || []).length, 'question with remote images');
  assert.strictEqual(build(remote).payload.metadata.remoteImages, remote.q.remoteImages.length);

  const broken = find((x) => (x.q.review || []).includes('broken-characters'), 'broken encoding');
  assert.deepStrictEqual(build(broken).payload.metadata.review, broken.q.review);

  const sessionQ = find((x) => x.q.session && x.q.answerKey, 'question with session and answer key');
  const m2 = build(sessionQ).payload.metadata;
  assert.strictEqual(m2.session, sessionQ.q.session);
  assert.strictEqual(m2.answerKey, sessionQ.q.answerKey);
});

test('keys: course, university and source from the file; unsorted has no university', () => {
  const unsorted = find((x) => !x.university && x.platform === 'mbset', 'mbset unsorted');
  const p = build(unsorted).payload;
  assert.strictEqual(p.universityKey, undefined);
  assert.strictEqual(p.questionSourceKey, 'src:other');
  assert.match(p.courseKey, /^course:module:year-\d:/);
  assert.strictEqual(p.examYear, undefined);
  assert.strictEqual(p.yearLevel, ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][unsorted.studyYear]);

  const noCourse = find((x) => x.view === 'course' && !x.course, 'file with course null');
  assert.match(build(noCourse).payload.courseKey, /:_no-course$/);

  const setifUnit = find((x) => x.university === 'setif' && x.module && x.module.slug === 'unite-4-2-eme', 'Sétif 2nd year unit 4');
  assert.match(build(setifUnit).payload.courseKey, /^course:module:year-2:unite-endocrinienne:/);
});

test('images: dataset paths become media urls, unusable ones are left out and counted', () => {
  const qi = find((x) => (x.q.questionImages || []).length, 'question image');
  assert.deepStrictEqual(build(qi).payload.questionImages, qi.q.questionImages.map(url));
  const ei = find((x) => (x.q.explanationImages || []).length, 'explanation image');
  assert.deepStrictEqual(build(ei).payload.explanationImages, ei.q.explanationImages.map(url));
  const missing = build(ei, () => null).payload;
  assert.deepStrictEqual(missing.explanationImages, []);
  assert.strictEqual(missing.metadata.missingImages, ei.q.explanationImages.length);
});

test('more than 10 explanation images: first 10 kept, the rest recorded in metadata', () => {
  const fixture = require('./fixtures/questions/over-10-explanation-images.json');
  const record = {
    uid: fixture.question.uid,
    q: fixture.question,
    view: 'course',
    university: fixture.university,
    kind: fixture.kind,
    tree: 'year',
    studyYear: fixture.studyYear,
    module: fixture.module,
    course: fixture.course,
    examYear: fixture.examYear,
    courseKey: 'course:module:year-6:maladies-de-systeme:la-maladie-de-behcet',
    universityKey: 'univ:alger',
    questionSourceKey: 'src:alger:externat',
  };
  const all = fixture.question.explanationImages.map(url);
  assert.ok(all.length > 10);
  const { payload, imagePaths } = build(record);
  assert.deepStrictEqual(payload.explanationImages, all.slice(0, 10));
  assert.deepStrictEqual(payload.metadata.explanationImagesOverflow, all.slice(10));
  const referenced = (fixture.question.questionImages || []).length + fixture.question.explanationImages.length;
  assert.strictEqual(imagePaths.length, referenced, 'every image is still uploaded');
  assert.strictEqual(payload.isPublished, true);
});

test('contentHash: sha256 of the canonical payload, stable, and sensitive to translations', () => {
  const r = find((x) => x.q.questionType === 'MULTIPLE_CHOICE', 'multiple choice');
  const a = build(r);
  const b = build(r);
  assert.strictEqual(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  const rest = { ...a.payload };
  delete rest.contentHash;
  assert.strictEqual(a.hash, sha256(canonicalJson(rest)));
  assert.strictEqual(contentHashOf(a.payload), a.hash);

  // Key order of the source does not matter
  const reversed = Object.fromEntries(Object.entries(r.q).reverse());
  assert.strictEqual(build({ ...r, q: reversed }).hash, a.hash);

  // A new translation changes the hash, the uid (sourceKey) does not change
  const translated = { ...r.q, en: { questionText: 'EN', answers: r.q.answers.map(() => ({ answerText: 'x' })) } };
  const c = build({ ...r, q: translated });
  assert.notStrictEqual(c.hash, a.hash);
  assert.strictEqual(c.payload.sourceKey, a.payload.sourceKey);
});
