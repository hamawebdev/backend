'use strict';

const fs = require('fs');
const path = require('path');
const { attributePaper } = require('./exams');

const SCHEMA = 'medadn-dataset/1';
const QUESTION_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC', 'UNKNOWN']);
const IMAGE_PATH = /^images\/([0-9a-f]{2})\/([0-9a-f]{40})\.(png|jpg|jpeg|gif|webp|avif|svg)$/;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Another process may be rewriting a file (translations are applied in place), so a
// file that does not parse is read again a few times before it counts as broken.
function readJson(file, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      lastError = error;
      if (error.code === 'ENOENT') break;
      sleepSync(500);
    }
  }
  throw lastError;
}

function isModuleExamPaper(data) {
  return data.view === 'paper' && data.kind !== 'residanat';
}

/**
 * Reads index.json and every file it lists. Returns question records (one per stored
 * question, course-file questions and questions embedded in papers), the papers, and
 * the validation findings.
 */
function loadDataset(dir, { log = () => {} } = {}) {
  const errors = [];
  const warnings = [];
  const index = readJson(path.join(dir, 'index.json'));
  if (!index || !Array.isArray(index.files)) throw new Error(`${dir}/index.json has no files list`);

  const records = [];
  const papers = [];
  const byUid = new Map();
  const universityNames = {};
  const embedded = [];

  const addRecord = (record) => {
    const { q } = record;
    if (!q || typeof q.uid !== 'string' || !q.uid) {
      errors.push({ phase: 'validate', key: `${record.file}#${record.pos}`, error: 'question without uid' });
      return;
    }
    if (byUid.has(q.uid)) {
      errors.push({ phase: 'validate', key: q.uid, error: `duplicate uid (also in ${byUid.get(q.uid).file})` });
      return;
    }
    if (!QUESTION_TYPES.has(q.questionType)) {
      errors.push({ phase: 'validate', key: q.uid, error: `unknown questionType ${q.questionType}` });
      return;
    }
    if (!Array.isArray(q.answers)) q.answers = [];
    for (const field of ['questionImages', 'explanationImages']) {
      const list = q[field] || [];
      const bad = list.filter((p) => !IMAGE_PATH.test(p));
      if (bad.length) {
        warnings.push({ phase: 'validate', key: q.uid, warning: `${field}: unexpected image path ${bad.join(', ')} (dropped)` });
        q[field] = list.filter((p) => IMAGE_PATH.test(p));
      }
    }
    if (q.en && Array.isArray(q.en.answers) && q.en.answers.length !== q.answers.length && q.questionType !== 'QROC') {
      warnings.push({ phase: 'validate', key: q.uid, warning: `en.answers has ${q.en.answers.length} items for ${q.answers.length} answers (answer translations skipped)` });
    }
    byUid.set(q.uid, record);
    records.push(record);
  };

  let done = 0;
  for (const entry of index.files) {
    const file = entry.path;
    let data;
    try {
      data = readJson(path.join(dir, file));
    } catch (error) {
      errors.push({ phase: 'validate', key: file, error: `cannot read: ${error.message}` });
      continue;
    }
    if (data.schema !== SCHEMA) {
      errors.push({ phase: 'validate', key: file, error: `schema ${data.schema} is not ${SCHEMA}` });
      continue;
    }
    if (data.university && data.universityName) universityNames[data.university] = data.universityName;
    if (data.view === 'course') {
      const unsorted = !data.university || data.university === '_unsorted';
      const kind = unsorted ? 'other' : data.kind;
      (data.questions || []).forEach((q, pos) => addRecord({
        uid: q.uid,
        q,
        file,
        pos,
        view: 'course',
        university: unsorted ? null : data.university,
        kind,
        platform: unsorted ? (data.unsorted && data.unsorted.platform) : (data.origin && data.origin.platform),
        tree: kind === 'residanat' ? 'residanat' : 'year',
        studyYear: data.studyYear,
        module: data.module,
        course: data.course || null,
        examYear: data.examYear,
        textFormat: data.textFormat,
      }));
    } else if (data.view === 'paper') {
      papers.push({ path: file, data });
      embedded.push({ file, data });
    } else {
      errors.push({ phase: 'validate', key: file, error: `unknown view ${data.view}` });
    }
    done++;
    if (done % 5000 === 0) log(`  read ${done}/${index.files.length} files`);
  }

  // Embedded paper questions, after every course file so attribution can use all names
  for (const { file, data } of embedded) {
    const moduleExam = isModuleExamPaper(data);
    const attribution = moduleExam ? attributePaper(data) : { university: data.university, militaire: false };
    (data.questions || []).forEach((entry, pos) => {
      if (entry.ref) return;
      const kind = moduleExam ? (attribution.militaire ? 'militaire' : data.kind || 'externat') : 'residanat';
      addRecord({
        uid: entry.uid,
        q: entry,
        file,
        pos,
        view: 'paper',
        university: attribution.university,
        kind,
        platform: data.origin && data.origin.platform,
        tree: moduleExam ? 'year' : 'residanat',
        studyYear: moduleExam ? data.studyYear : undefined,
        module: moduleExam ? data.module : undefined,
        course: null,
        examYear: data.examYear,
        textFormat: data.textFormat,
        paper: { path: file, data, n: entry.n, moduleExam },
      });
    });
  }

  // Paper references must resolve to a stored question in the file they name
  let refs = 0;
  for (const { path: file, data } of papers) {
    for (const entry of data.questions || []) {
      if (!entry.ref) continue;
      refs++;
      const target = byUid.get(entry.ref);
      if (!target) errors.push({ phase: 'validate', key: file, error: `n=${entry.n}: ref ${entry.ref} not found` });
      else if (entry.in && target.file !== entry.in) warnings.push({ phase: 'validate', key: file, warning: `n=${entry.n}: ref ${entry.ref} is in ${target.file}, not ${entry.in}` });
    }
  }

  const expected = index.questions && index.questions.storedOnce;
  if (typeof expected === 'number' && expected !== records.length) {
    warnings.push({ phase: 'validate', key: 'index.json', warning: `index says ${expected} stored questions, files hold ${records.length}` });
  }

  // Constantine and Batna appear only through papers in some trees: keep their names
  for (const [key, name] of Object.entries({ constantine: 'Constantine', batna: 'Batna' })) {
    if (!universityNames[key]) universityNames[key] = name;
  }

  return { dir, index, records, papers, byUid, universityNames, errors, warnings, refs };
}

module.exports = { loadDataset, readJson, isModuleExamPaper, IMAGE_PATH };
