'use strict';

const { normalizeName, moduleKeyFor, yearLevel } = require('./normalize');

// Module exam papers all sit under alger/exams, but some are other universities'
// papers or the military school's, which only their name tells.
function attributePaper(data) {
  const text = normalizeName(`${data.name || ''} ${data.session || ''}`);
  if (/(^|-)mili(?:t|at)[a-z]*/.test(text)) return { university: 'alger', militaire: true, reattributed: true };
  if (/(^|-)constantine(-|$)/.test(text)) return { university: 'constantine', militaire: false, reattributed: true };
  if (/(^|-)batna(-|$)/.test(text)) return { university: 'batna', militaire: false, reattributed: true };
  return { university: data.university || 'alger', militaire: false, reattributed: false };
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best;
  for (const [v, n] of counts) if (best === undefined || n > counts.get(best) || (n === counts.get(best) && v > best)) best = v;
  return best;
}

// Exam.year is required. Academic years count as their second (exam) year, which is
// what the dataset itself does for every paper that has both fields. When the paper,
// its name and its questions carry no year, the most common year of the other papers
// of the same module is used (reported, and said in the exam description).
function resolveExamYear(data, questionYears, moduleYears = []) {
  if (Number.isInteger(data.examYear)) return { year: data.examYear, from: 'examYear' };
  const text = `${data.academicYear || ''} ${data.name || ''} ${data.session || ''}`;
  let m = /\b((?:19|20)\d{2})\s*[-/]\s*((?:19|20)\d{2})\b/.exec(text);
  if (m) return { year: Number(m[2]), from: 'academic year in name' };
  m = /\b(\d{2})\s*\/\s*(\d{2})\b/.exec(text);
  if (m && Number(m[2]) === (Number(m[1]) + 1) % 100) return { year: 2000 + Number(m[2]), from: `academic year '${m[0]}' in name` };
  m = /\b((?:19|20)\d{2})\b/.exec(text);
  if (m) return { year: Number(m[1]), from: 'year in name' };
  const years = questionYears.filter((y) => Number.isInteger(y));
  if (years.length) return { year: mostCommon(years), from: 'most common exam year of its questions', estimated: true };
  const siblings = moduleYears.filter((y) => Number.isInteger(y));
  if (siblings.length) return { year: mostCommon(siblings), from: 'most common year of the other papers of its module', estimated: true };
  return { year: null, from: 'none' };
}

function examTitle(data, attribution, universityNames) {
  let title = String(data.name || '').replace(/\s+/g, ' ').trim() || data.session || 'Examen';
  if (attribution.militaire) {
    title = title.replace(/\bmiliatire\b/gi, 'Militaire');
    if (!/militaire/i.test(title)) title += ' Militaire';
  } else if (attribution.reattributed) {
    const name = universityNames[attribution.university];
    if (name && !normalizeName(title).includes(normalizeName(name))) title += ` - ${name}`;
  }
  return title;
}

function paperModuleKey(data) {
  return data.module && data.studyYear ? moduleKeyFor('year', data.studyYear, data.module) : null;
}

function moduleYearsOf(papers, moduleKey) {
  return papers.filter((p) => p.data.kind !== 'residanat' && paperModuleKey(p.data) === moduleKey).map((p) => p.data.examYear);
}

/**
 * paper: { path, data }. context: the dataset (byUid for the questions' years, papers
 * for the module's other papers, universityNames).
 * Returns { payload, yearFrom, attribution } or { sourceKey, error }.
 */
function buildExam(paper, { byUid, universityNames, papers = [] }) {
  const { data } = paper;
  const attribution = attributePaper(data);
  const entries = [...(data.questions || [])].sort((a, b) => (a.n || 0) - (b.n || 0));
  const questionKeys = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = entry.ref || entry.uid;
    if (key && !seen.has(key)) {
      seen.add(key);
      questionKeys.push(key);
    }
  }
  const sourceKey = `exam:${paper.path}`;
  const moduleKey = paperModuleKey(data);
  if (!moduleKey) return { sourceKey, error: 'paper has no module or study year' };
  const years = questionKeys.map((k) => byUid.get(k)).filter(Boolean).map((r) => r.examYear);
  const { year, from, estimated } = resolveExamYear(data, years, moduleYearsOf(papers, moduleKey));
  if (year === null) return { sourceKey, error: 'no exam year in the paper, its name, its questions or its module' };
  const payload = {
    sourceKey,
    title: examTitle(data, attribution, universityNames),
    moduleKey,
    universityKey: `univ:${attribution.university}`,
    yearLevel: yearLevel(data.studyYear),
    year,
    questionKeys,
  };
  if (estimated) payload.description = "Année non indiquée dans l'épreuve : année estimée.";
  return { sourceKey, payload, yearFrom: from, attribution, duplicates: entries.length - questionKeys.length };
}

module.exports = { attributePaper, resolveExamYear, examTitle, buildExam };
