'use strict';

// The verify phase: proves that everything the run imports is on the server, item by
// item, re-sends exactly what is missing or different, and checks again.
//   (a) questions: POST /admin/import/questions/state for every local sourceKey
//       (5,000 per request), server contentHash compared with the local one
//   (b) images: POST /admin/import/media/check with every local image name
//       (10,000 per request)
//   (c) exams: acknowledged in the state (the server linked all their questions) and,
//       from GET /admin/import/stats, the server's exam count and exam-question links
//       (the API has no per-exam state endpoint)
//   (d) the reconciliation of totals (same stats request)

const { runPool, fromList } = require('./pool');
const { chunk } = require('./util');
const { checkImages, uploadImages, imageName, imageUrlForName } = require('./images');
const { sendHierarchy, sendQuestions, sendExams } = require('./send');
const { compare, formatTable, serverView } = require('./reconcile');

const STATE_QUERY_SIZE = 5000;
const KEYS_IN_LOG = 200;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function numberOf(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

/** sourceKey -> { id, contentHash } for the given keys the server holds */
async function fetchQuestionState({ api, options, shouldStop }, keys, progress) {
  const found = new Map();
  await runPool({
    size: options.concurrency,
    next: fromList(chunk(keys, STATE_QUERY_SIZE)),
    shouldStop,
    worker: async (group) => {
      const res = await api.request('POST', '/admin/import/questions/state', { json: { sourceKeys: group } });
      for (const it of (res.data && res.data.items) || []) {
        if (it && it.sourceKey) found.set(it.sourceKey, { id: it.id, contentHash: it.contentHash || null });
      }
      if (progress) progress.add(group.length);
    },
  });
  return found;
}

/** One full comparison of the local plan with the server. Updates the state with what it finds. */
async function inspect(ctx, plan) {
  const { api, state, options, progress } = ctx;
  const inSample = plan.mode === 'sample';

  // (a) questions
  const keys = plan.questions.map((i) => i.payload.sourceKey);
  if (progress) progress.begin('verify questions', keys.length, 'keys');
  const server = await fetchQuestionState(ctx, keys, progress);
  if (progress) progress.end();
  const questions = { total: keys.length, matched: 0, missing: [], mismatched: [] };
  for (const item of plan.questions) {
    const key = item.payload.sourceKey;
    const s = server.get(key);
    const known = state.get('question', key) || {};
    if (!s) {
      questions.missing.push(item);
      state.putIfChanged('question', key, { hash: null, id: known.id === undefined ? null : known.id });
    } else if (s.contentHash !== item.hash) {
      questions.mismatched.push(item);
      state.putIfChanged('question', key, { hash: s.contentHash, id: s.id });
    } else {
      questions.matched++;
      state.putIfChanged('question', key, { hash: item.hash, id: s.id });
    }
  }

  // (b) images
  const existing = await checkImages({ api, names: plan.images.map((i) => i.name), concurrency: options.concurrency, shouldStop: ctx.shouldStop });
  const images = { total: plan.images.length, present: 0, missing: [] };
  for (const image of plan.images) {
    if (existing.has(image.name)) {
      images.present++;
      if (!state.acknowledged('image', image.name)) state.put('image', image.name, { url: imageUrlForName(image.name), existed: true });
    } else {
      images.missing.push(image);
      state.putIfChanged('image', image.name, { missing: true });
    }
  }

  // (c) exams and (d) totals
  const res = await api.request('GET', '/admin/import/stats');
  const stats = res.data || {};
  const view = serverView(stats);
  const exams = { total: plan.exams.length, acknowledged: 0, unacknowledged: [] };
  for (const exam of plan.exams) {
    if ((state.get('exam', exam.sourceKey) || {}).hash === exam.hash) exams.acknowledged++;
    else exams.unacknowledged.push(exam);
  }
  const atLeast = (server, local) => (server === undefined ? null : inSample ? server >= local : server === local);
  exams.serverCount = view.exams;
  exams.countOk = atLeast(view.exams, exams.total);
  exams.expectedLinks = plan.exams.reduce((n, e) => n + e.payload.questionKeys.length, 0);
  exams.serverLinks = numberOf(stats.exams && typeof stats.exams === 'object' ? stats.exams.examQuestions : undefined);
  exams.linksOk = atLeast(exams.serverLinks, exams.expectedLinks);
  const reconciliation = compare(plan.totals, stats, plan.mode);
  state.flush();

  const itemsClean = !questions.missing.length && !questions.mismatched.length && !images.missing.length
    && !exams.unacknowledged.length && exams.countOk !== false && exams.linksOk !== false;
  return { questions, images, exams, reconciliation, stats, itemsClean };
}

function listKeys(keys) {
  const shown = keys.slice(0, KEYS_IN_LOG).join(', ');
  return keys.length > KEYS_IN_LOG ? `${shown} (... ${fmt(keys.length - KEYS_IN_LOG)} more in the report)` : shown;
}

function describe(found) {
  const { questions: q, images: img, exams: ex, reconciliation } = found;
  const examServer = ex.serverCount === undefined ? 'not reported' : `${fmt(ex.serverCount)}${ex.countOk === false ? ' (MISMATCH)' : ''}`;
  const links = ex.serverLinks === undefined ? 'not reported' : `${fmt(ex.serverLinks)}/${fmt(ex.expectedLinks)}${ex.linksOk === false ? ' (MISMATCH)' : ''}`;
  return [
    `  questions  ${fmt(q.matched)}/${fmt(q.total)} match (${fmt(q.missing.length)} missing, ${fmt(q.mismatched.length)} with another contentHash)`,
    `  images     ${fmt(img.present)}/${fmt(img.total)} on the server (${fmt(img.missing.length)} missing)`,
    `  exams      ${fmt(ex.acknowledged)}/${fmt(ex.total)} acknowledged; server holds ${examServer} exams, exam-question links ${links}`,
    `  totals     ${reconciliation.mismatches} reconciliation mismatch(es)`,
  ].join('\n');
}

function logFindings(log, found) {
  const { questions: q, images: img, exams: ex } = found;
  if (q.missing.length) log(`  questions missing on the server: ${listKeys(q.missing.map((i) => i.payload.sourceKey))}`);
  if (q.mismatched.length) log(`  questions with another contentHash on the server: ${listKeys(q.mismatched.map((i) => i.payload.sourceKey))}`);
  if (img.missing.length) log(`  images missing on the server: ${listKeys(img.missing.map((i) => i.name))}`);
  if (ex.unacknowledged.length) log(`  exams not acknowledged: ${listKeys(ex.unacknowledged.map((e) => e.sourceKey))}`);
}

function addCounts(counts, prefix, from) {
  for (const [k, v] of Object.entries(from)) {
    const name = `${prefix}${k[0].toUpperCase()}${k.slice(1)}`;
    counts[name] = (counts[name] || 0) + v;
  }
}

/**
 * Re-sends exactly what `found` lists: the hierarchy first (a question or exam may be
 * missing because its course or module is), then the missing images, the missing and
 * mismatched questions (not those whose image still cannot be uploaded), then the
 * unacknowledged exams, or every exam when the server's exam totals differ (the API
 * cannot tell which one) unless that was already tried in vain and no question changed
 * since. Returns { examsChanged, questionsChanged, resentAllExams }.
 */
async function repair(ctx, plan, found, counts, { examTotalsOff, examResendUseless }) {
  const { log, report, progress, options, shouldStop } = ctx;
  const questions = [...found.questions.missing, ...found.questions.mismatched];

  if (questions.length || found.exams.unacknowledged.length || examTotalsOff) {
    log('  re-sending the hierarchy');
    await sendHierarchy(ctx, { force: true });
  }

  const failedImages = new Set();
  if (found.images.missing.length && !shouldStop()) {
    log(`  uploading ${fmt(found.images.missing.length)} image(s)`);
    if (progress) progress.begin('repair images', found.images.missing.length, 'uploads');
    const res = await uploadImages({ ...ctx, items: found.images.missing, concurrency: options.imageConcurrency, phase: 'verify' });
    if (progress) progress.end();
    counts.imagesUploaded = (counts.imagesUploaded || 0) + res.uploaded;
    for (const name of res.failed) failedImages.add(name);
  }

  const sendable = [];
  for (const item of questions) {
    const blocked = item.imagePaths.map(imageName).filter((n) => failedImages.has(n));
    if (blocked.length) report.failure('verify', item.payload.sourceKey, `not sent: image upload failed for ${blocked.join(', ')}`);
    else sendable.push(item);
  }
  let questionsChanged = 0;
  if (sendable.length && !shouldStop()) {
    log(`  sending ${fmt(sendable.length)} question(s)`);
    if (progress) progress.begin('repair questions', sendable.length, 'questions');
    const qCounts = {};
    await sendQuestions(ctx, sendable, qCounts, 'verify');
    if (progress) progress.end();
    questionsChanged = (qCounts.created || 0) + (qCounts.updated || 0);
    addCounts(counts, 'questions', qCounts);
  }

  const resentAllExams = examTotalsOff && (!examResendUseless || questionsChanged > 0);
  const exams = resentAllExams ? plan.exams : found.exams.unacknowledged;
  let examsChanged = 0;
  if (exams.length && !shouldStop()) {
    log(`  sending ${fmt(exams.length)} exam(s)${resentAllExams ? ' (every exam: the server totals differ)' : ''}`);
    const eCounts = {};
    const { changed } = await sendExams(ctx, exams, eCounts, 'verify');
    examsChanged = changed.size;
    addCounts(counts, 'exams', eCounts);
  }
  return { examsChanged, questionsChanged, resentAllExams };
}

/**
 * Runs the verification, and up to options.repairRounds rounds of repair + verification.
 * Returns { itemsClean, mismatches, verified, verdict (the final VERIFIED / NOT VERIFIED
 * line), verifiedKeys (Set of the question, image and exam keys found in order) }.
 */
async function phaseVerify(ctx, plan) {
  const { log, report, options, shouldStop } = ctx;
  const counts = report.phase('verify');
  const rounds = options.repairRounds;
  let found;
  let examResendUseless = false;
  for (let round = 0; ; round++) {
    log(round === 0 ? '  checking every question, image and exam on the server' : `  verifying again (after repair round ${round})`);
    found = await inspect(ctx, plan);
    counts.checks = round + 1;
    log(describe(found));
    if (round === 0) {
      counts.initial = {
        questionsMissing: found.questions.missing.length,
        questionsMismatched: found.questions.mismatched.length,
        imagesMissing: found.images.missing.length,
        examsUnacknowledged: found.exams.unacknowledged.length,
        examCountOk: found.exams.countOk,
        examLinksOk: found.exams.linksOk,
      };
    }
    if (found.itemsClean || shouldStop()) break;
    logFindings(log, found);
    if (round >= rounds) break;
    const examTotalsOff = found.exams.countOk === false || found.exams.linksOk === false;
    if (!found.questions.missing.length && !found.questions.mismatched.length && !found.images.missing.length
      && !found.exams.unacknowledged.length && !(examTotalsOff && !examResendUseless)) break; // nothing left that re-sending can fix
    log(`Repair round ${round + 1}/${rounds}`);
    counts.repairRounds = round + 1;
    const { examsChanged, resentAllExams } = await repair(ctx, plan, found, counts, { examTotalsOff, examResendUseless });
    // Every exam sent again and none changed: the difference is not one re-sending fixes
    if (resentAllExams) examResendUseless = examsChanged === 0;
  }

  const { questions: q, images: img, exams: ex, reconciliation } = found;
  report.set('reconciliation', { mode: plan.mode, mismatches: reconciliation.mismatches, rows: reconciliation.rows, serverStats: found.stats });
  log(formatTable(reconciliation.rows));
  const na = reconciliation.rows.filter((r) => r.status === 'n/a').length;
  log(`Reconciliation: ${reconciliation.mismatches} mismatch(es)${na ? `, ${na} figure(s) not reported by the server` : ''}${plan.mode === 'sample' ? ' (sample mode: server must hold at least the sample)' : ''}`);

  const unverified = {
    questionsMissing: q.missing.map((i) => i.payload.sourceKey),
    questionsMismatched: q.mismatched.map((i) => i.payload.sourceKey),
    imagesMissing: img.missing.map((i) => i.name),
    examsUnacknowledged: ex.unacknowledged.map((e) => e.sourceKey),
  };
  Object.assign(counts, {
    questions: q.total,
    questionsMatched: q.matched,
    images: img.total,
    imagesPresent: img.present,
    exams: ex.total,
    examsAcknowledged: ex.acknowledged,
    serverExams: ex.serverCount,
    examLinks: { expected: ex.expectedLinks, server: ex.serverLinks },
    reconciliationMismatches: reconciliation.mismatches,
    unverified,
  });

  const summary = `${q.matched}/${q.total} questions, ${img.present}/${img.total} images, ${ex.acknowledged}/${ex.total} exams match`;
  const verified = found.itemsClean && reconciliation.mismatches === 0;
  let verdict;
  if (verified) {
    verdict = `VERIFIED: ${summary}`;
  } else {
    const problems = [];
    if (q.missing.length) problems.push(`${q.missing.length} question(s) missing: ${listKeys(unverified.questionsMissing)}`);
    if (q.mismatched.length) problems.push(`${q.mismatched.length} question(s) with another contentHash: ${listKeys(unverified.questionsMismatched)}`);
    if (img.missing.length) problems.push(`${img.missing.length} image(s) missing: ${listKeys(unverified.imagesMissing)}`);
    if (ex.unacknowledged.length) problems.push(`${ex.unacknowledged.length} exam(s) not acknowledged: ${listKeys(unverified.examsUnacknowledged)}`);
    if (ex.countOk === false) problems.push(`the server holds ${ex.serverCount} imported exams, the dataset ${ex.total}`);
    if (ex.linksOk === false) problems.push(`the server holds ${ex.serverLinks} exam-question links, the dataset ${ex.expectedLinks}`);
    if (reconciliation.mismatches) problems.push(`${reconciliation.mismatches} reconciliation mismatch(es) (table above)`);
    verdict = `NOT VERIFIED: ${summary}\n  ${problems.join('\n  ')}`;
  }
  counts.verified = verified;

  const verifiedKeys = new Set();
  const bad = new Set([...unverified.questionsMissing, ...unverified.questionsMismatched, ...unverified.imagesMissing, ...unverified.examsUnacknowledged]);
  for (const item of plan.questions) if (!bad.has(item.payload.sourceKey)) verifiedKeys.add(item.payload.sourceKey);
  for (const image of plan.images) if (!bad.has(image.name)) verifiedKeys.add(image.name);
  if (ex.countOk !== false && ex.linksOk !== false) for (const exam of plan.exams) if (!bad.has(exam.sourceKey)) verifiedKeys.add(exam.sourceKey);
  return { itemsClean: found.itemsClean, mismatches: reconciliation.mismatches, verified, verdict, verifiedKeys };
}

module.exports = { phaseVerify, inspect, fetchQuestionState, STATE_QUERY_SIZE };
