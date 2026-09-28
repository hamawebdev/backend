'use strict';

const { isModuleExamPaper } = require('./dataset');
const { assignKeys, buildHierarchy } = require('./hierarchy');
const { buildQuestionPayload } = require('./mapping');
const { buildExam } = require('./exams');
const { selectSample } = require('./sample');
const { imageName, imageUrlForName } = require('./images');
const { localTotals } = require('./reconcile');
const { canonicalJson, sha256 } = require('./util');

const MAX_KEY_LENGTH = 200;

/** The records and module exam papers a run imports: everything, or the sample. */
function selectRecords(dataset, mode) {
  if (!dataset.naming) assignKeys(dataset);
  if (mode === 'sample') return selectSample(dataset);
  return { records: dataset.records, papers: dataset.papers.filter((p) => isModuleExamPaper(p.data)), coverage: null };
}

function referencedImagePaths(records) {
  const paths = new Set();
  for (const r of records) for (const p of [...(r.q.questionImages || []), ...(r.q.explanationImages || [])]) paths.add(p);
  return [...paths].sort();
}

/**
 * Builds every payload of a run. imageStatus (from images.verifyImages) removes images
 * that cannot be served; without it every referenced image is assumed fine.
 */
function buildPlan(dataset, selection, { imageStatus = null } = {}) {
  if (!dataset.naming) assignKeys(dataset);
  const warnings = [];
  const imageUrl = (p) => {
    const status = imageStatus && imageStatus.get(p);
    if (status && !status.ok) return null;
    return imageUrlForName(imageName(p));
  };

  const questions = selection.records.map((record) => {
    const item = { record, ...buildQuestionPayload(record, { imageUrl }) };
    for (const w of item.warnings) warnings.push({ phase: 'plan', key: record.uid, warning: w });
    return item;
  });

  const exams = [];
  const examErrors = [];
  for (const paper of selection.papers) {
    const exam = buildExam(paper, dataset);
    if (exam.error) {
      examErrors.push(exam);
      warnings.push({ phase: 'plan', key: exam.sourceKey, warning: `exam left out: ${exam.error}` });
      continue;
    }
    exam.hash = sha256(canonicalJson(exam.payload));
    if (exam.yearFrom !== 'examYear') warnings.push({ phase: 'plan', key: exam.sourceKey, warning: `year ${exam.payload.year} taken from the ${exam.yearFrom}` });
    if (exam.duplicates) warnings.push({ phase: 'plan', key: exam.sourceKey, warning: `${exam.duplicates} repeated question(s) listed once` });
    exams.push(exam);
  }

  const hierarchy = buildHierarchy(dataset, selection.records, exams.map((e) => e.payload));

  const images = new Map();
  for (const item of questions) {
    for (const p of item.imagePaths) {
      const status = imageStatus && imageStatus.get(p);
      if (status && !status.ok) {
        warnings.push({ phase: 'plan', key: item.record.uid, warning: `image ${p} left out: ${status.reason}` });
        continue;
      }
      const name = imageName(p);
      if (!images.has(name)) images.set(name, { name, path: p, size: status ? status.size : undefined });
    }
  }

  // The API accepts keys of at most 200 characters
  const errors = [];
  const keys = [
    ...Object.values(hierarchy).flatMap((list) => list.map((e) => e.sourceKey)),
    ...questions.map((q) => q.payload.sourceKey),
    ...exams.map((e) => e.sourceKey),
  ];
  for (const key of keys) if (key.length > MAX_KEY_LENGTH) errors.push({ phase: 'plan', key, error: `key longer than ${MAX_KEY_LENGTH} characters` });

  const plan = {
    mode: selection.coverage ? 'sample' : 'full',
    errors,
    coverage: selection.coverage,
    questions,
    exams,
    examErrors,
    hierarchy,
    images: [...images.values()],
    warnings,
  };
  plan.totals = localTotals(plan);
  return plan;
}

module.exports = { selectRecords, referencedImagePaths, buildPlan };
