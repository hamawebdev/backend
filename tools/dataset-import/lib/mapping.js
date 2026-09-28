'use strict';

const { canonicalJson, sha256, compact } = require('./util');
const { yearLevel, mapPart } = require('./normalize');

const MAX_EXPLANATION_IMAGES = 10;
const ORIGIN_TYPES = { qcs: 'SINGLE_CHOICE', qcm: 'MULTIPLE_CHOICE', combinaison: 'MULTIPLE_CHOICE', qroc: 'QROC' };

function text(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value);
  return s === '' ? undefined : s;
}

function deriveType(q) {
  if (ORIGIN_TYPES[q.originType]) return ORIGIN_TYPES[q.originType];
  const correct = (q.answers || []).filter((a) => a.isCorrect === true).length;
  return correct > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
}

// sha256 of the canonical JSON of the whole payload except contentHash itself
function contentHashOf(payload) {
  const rest = { ...payload };
  delete rest.contentHash;
  return sha256(canonicalJson(rest));
}

/**
 * Maps one dataset question record (see dataset.js, keys set by hierarchy.assignKeys)
 * to the PUT /admin/import/questions item.
 * imageUrl(datasetPath) returns the media url, or null for an image that cannot be served.
 */
function buildQuestionPayload(record, { imageUrl }) {
  const q = record.q;
  const en = q.en && typeof q.en === 'object' ? q.en : undefined;
  const paper = record.paper;
  const paperData = paper && paper.data;
  const warnings = [];

  const questionType = q.questionType === 'UNKNOWN' ? deriveType(q) : q.questionType;
  const questionText = typeof q.questionText === 'string' ? q.questionText : '';
  const sourceAnswers = Array.isArray(q.answers) ? q.answers : [];

  let answers;
  if (questionType === 'QROC') {
    answers = text(q.expectedAnswer)
      ? [compact({ position: 0, answerText: q.expectedAnswer, answerTextEn: text(en && en.expectedAnswer), isCorrect: true })]
      : [];
  } else {
    const enAnswers = en && Array.isArray(en.answers) && en.answers.length === sourceAnswers.length ? en.answers : [];
    answers = sourceAnswers.map((a, i) => {
      const t = enAnswers[i] || {};
      return compact({
        position: i,
        answerText: a.answerText === undefined || a.answerText === null ? '' : String(a.answerText),
        answerTextEn: text(t.answerText),
        isCorrect: a.isCorrect === true,
        explanation: text(a.explanation),
        explanationEn: text(t.explanation),
      });
    });
  }

  const unpublishedReasons = [];
  if (q.questionType === 'UNKNOWN') unpublishedReasons.push('unknown-type');
  if (!questionText.trim()) unpublishedReasons.push('empty-question');
  if (questionType !== 'QROC') {
    if (answers.length < 2) unpublishedReasons.push('fewer-than-two-answers');
    if (!answers.some((a) => a.isCorrect)) unpublishedReasons.push('no-correct-answer');
  }

  const questionImages = (q.questionImages || []).map(imageUrl).filter(Boolean);
  const explanationAll = (q.explanationImages || []).map(imageUrl).filter(Boolean);
  const explanationImages = explanationAll.slice(0, MAX_EXPLANATION_IMAGES);
  const overflow = explanationAll.slice(MAX_EXPLANATION_IMAGES);
  const droppedImages = (q.questionImages || []).length + (q.explanationImages || []).length - questionImages.length - explanationAll.length;

  const rawPart = q.part !== undefined ? q.part : paperData && paperData.part;
  const part = mapPart(rawPart);
  if (rawPart && !part) warnings.push(`unknown residency part '${rawPart}'`);

  const metadata = compact({
    part,
    session: q.session !== undefined ? q.session : paperData && paperData.session,
    month: q.month !== undefined ? q.month : paperData && paperData.month,
    number: q.number !== undefined ? q.number : paper && paper.n,
    answerKey: q.answerKey,
    case: q.case,
    isInverse: q.isInverse,
    originType: q.originType,
    origin: q.origin,
    review: Array.isArray(q.review) && q.review.length ? q.review : undefined,
    remoteImages: Array.isArray(q.remoteImages) && q.remoteImages.length ? q.remoteImages.length : undefined,
    language: q.language,
    explanationImagesOverflow: overflow.length ? overflow : undefined,
    missingImages: droppedImages > 0 ? droppedImages : undefined,
    unpublishedReasons: unpublishedReasons.length ? unpublishedReasons : undefined,
  });

  const payload = compact({
    sourceKey: q.uid,
    courseKey: record.courseKey,
    universityKey: record.universityKey,
    questionSourceKey: record.questionSourceKey,
    examYear: Number.isInteger(record.examYear) ? record.examYear : undefined,
    yearLevel: yearLevel(record.studyYear),
    questionType,
    isPublished: unpublishedReasons.length === 0,
    questionText,
    questionTextEn: text(en && en.questionText),
    explanation: text(q.explanation),
    explanationEn: text(en && en.explanation),
    metadata: Object.keys(metadata).length ? metadata : undefined,
    tags: Array.isArray(q.questionTags) ? q.questionTags.map(String) : [],
    repetitionCount: Number.isInteger(q.repetitionCount) ? q.repetitionCount : undefined,
    repetitionYears: Array.isArray(q.repetitionYears) ? q.repetitionYears : [],
    questionImages,
    explanationImages,
    answers,
  });
  const contentHash = contentHashOf(payload);
  payload.contentHash = contentHash;

  return {
    payload,
    hash: contentHash,
    imagePaths: [...(q.questionImages || []), ...(q.explanationImages || [])],
    part,
    warnings,
  };
}

module.exports = { buildQuestionPayload, contentHashOf, deriveType, MAX_EXPLANATION_IMAGES };
