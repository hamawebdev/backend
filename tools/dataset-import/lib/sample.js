'use strict';

const { isModuleExamPaper } = require('./dataset');

function residencyPart(r) {
  if (r.q.part !== undefined) return r.q.part;
  return r.paper && r.paper.data.part;
}

function englishFull(q) {
  const en = q.en;
  return Boolean(en && en.questionText && en.explanation && Array.isArray(en.answers) && en.answers.some((a) => a && a.explanation));
}

function comboOf(r) {
  return r.university ? `${r.university}/${r.kind}` : `_unsorted/${r.platform}`;
}

/**
 * Picks a small set of questions that covers every kind of data the import has to
 * handle, plus one module exam paper with all of its questions.
 * Returns { records, papers, coverage } where coverage maps each criterion to the
 * uid (or paper path) that covers it, or null when the dataset has none.
 */
function selectSample(dataset) {
  const records = dataset.records;
  const chosen = new Set();
  const coverage = {};
  const extraPapers = new Set();
  // Questions embedded in a module exam paper only make sense with their exam, so they
  // are picked last, and then bring their whole paper along
  const inModuleExam = (r) => Boolean(r.paper && r.paper.moduleExam);
  const pick = (name, predicate) => {
    const r = records.find((x) => !inModuleExam(x) && predicate(x)) || records.find(predicate);
    coverage[name] = r ? r.uid : null;
    if (r) chosen.add(r);
    if (r && inModuleExam(r)) extraPapers.add(r.paper.path);
  };

  const combos = [...new Set(records.map(comboOf))].sort();
  for (const combo of combos) pick(`university-kind ${combo}`, (r) => comboOf(r) === combo);

  pick('single-choice', (r) => r.q.questionType === 'SINGLE_CHOICE');
  pick('multiple-choice', (r) => r.q.questionType === 'MULTIPLE_CHOICE');
  pick('qroc-with-expected-answer', (r) => r.q.questionType === 'QROC' && Boolean(r.q.expectedAnswer));
  pick('qroc-without-expected-answer', (r) => r.q.questionType === 'QROC' && !r.q.expectedAnswer);
  pick('question-images', (r) => (r.q.questionImages || []).length > 0);
  pick('explanation-images', (r) => (r.q.explanationImages || []).length > 0 && r.q.explanationImages.length <= 10);
  pick('explanation-images-over-10', (r) => (r.q.explanationImages || []).length > 10);
  pick('remote-images', (r) => (r.q.remoteImages || []).length > 0);
  pick('english-text-explanation-answer-explanations', (r) => englishFull(r.q));
  pick('english-qroc-expected-answer', (r) => r.q.questionType === 'QROC' && Boolean(r.q.en && r.q.en.expectedAnswer));

  const residency = records.filter((r) => r.kind === 'residanat');
  const parts = [...new Set(residency.map((r) => `${r.university}/${residencyPart(r) || 'no-part'}`))].sort();
  for (const part of parts) pick(`residency-part ${part}`, (r) => r.kind === 'residanat' && `${r.university}/${residencyPart(r) || 'no-part'}` === part);
  pick('residanat-embedded-paper-question', (r) => r.view === 'paper' && r.paper && !r.paper.moduleExam);

  pick('unsorted-cramqcm', (r) => !r.university && r.platform === 'cramqcm');
  pick('unsorted-mbset', (r) => !r.university && r.platform === 'mbset');
  pick('unpublished-unknown-type', (r) => r.q.questionType === 'UNKNOWN');
  pick('empty-question', (r) => !String(r.q.questionText || '').trim());
  pick('case-question', (r) => Boolean(r.q.case));
  pick('inverse-question', (r) => r.q.isInverse === true);
  pick('broken-encoding', (r) => Array.isArray(r.q.review) && r.q.review.includes('broken-characters'));

  // Smallest module exam paper that has both references and embedded questions
  const candidates = dataset.papers
    .filter((p) => isModuleExamPaper(p.data))
    .filter((p) => p.data.questions.some((e) => e.ref) && p.data.questions.some((e) => !e.ref))
    .sort((a, b) => a.data.questions.length - b.data.questions.length || (a.path < b.path ? -1 : 1));
  const papers = candidates.length ? [candidates[0]] : [];
  coverage['module-exam-paper-refs-and-embedded'] = papers.length ? papers[0].path : null;
  for (const p of dataset.papers) if (extraPapers.has(p.path) && !papers.includes(p)) papers.push(p);
  for (const paper of papers) {
    for (const entry of paper.data.questions) {
      const r = dataset.byUid.get(entry.ref || entry.uid);
      if (r) chosen.add(r);
    }
  }

  const order = new Map(records.map((r, i) => [r, i]));
  return {
    records: [...chosen].sort((a, b) => order.get(a) - order.get(b)),
    papers,
    coverage,
  };
}

module.exports = { selectSample };
