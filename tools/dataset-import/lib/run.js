'use strict';

const fs = require('fs');
const path = require('path');
const { loadDataset } = require('./dataset');
const { selectRecords, referencedImagePaths, buildPlan } = require('./plan');
const { verifyImages, syncImages, imageName } = require('./images');
const { StateStore } = require('./state');
const { ApiClient } = require('./api');
const { Report } = require('./report');
const { Progress } = require('./progress');
const { compare, formatTable } = require('./reconcile');
const { sendHierarchy, sendQuestions, sendExams, hierarchyHash, COURSES_PER_HIERARCHY_REQUEST, EXAMS_PER_REQUEST } = require('./send');
const { phaseVerify, fetchQuestionState, STATE_QUERY_SIZE } = require('./verify');
const { formatDuration } = require('./util');

// verify is the final check; reconcile alone (--phases reconcile) only prints the totals
// table, and is part of verify when both run
const PHASES = ['hierarchy', 'media', 'questions', 'exams', 'verify', 'reconcile'];
const MEDIA_CHECK_SIZE = 10000;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function countTable(title, groups) {
  const lines = [title];
  const keys = Object.keys(groups).sort();
  const width = Math.max(10, ...keys.map((k) => `${groups[k].name} (${k})`.length));
  lines.push(`  ${'group'.padEnd(width)}  ${'questions'.padStart(9)}  ${'published'.padStart(9)}  ${'unpublished'.padStart(11)}  ${'english'.padStart(7)}`);
  for (const k of keys) {
    const g = groups[k];
    lines.push(`  ${`${g.name} (${k})`.padEnd(width)}  ${fmt(g.questions).padStart(9)}  ${fmt(g.published).padStart(9)}  ${fmt(g.unpublished).padStart(11)}  ${fmt(g.withEnglish).padStart(7)}`);
  }
  return lines.join('\n');
}

function moduleTable(dataset, plan) {
  const { naming } = dataset;
  const lines = ['Canonical modules (key | name | spellings found):'];
  for (const m of plan.hierarchy.modules) {
    const info = naming.moduleInfo.get(m.sourceKey);
    const variants = [...(naming.moduleVariants.get(`${info.studyYear}:${info.slug}`) || new Map()).entries()]
      .map(([name, n]) => `${name} x${Math.round(n)}`)
      .join('; ');
    lines.push(`  ${m.sourceKey} | ${m.name} | ${variants}`);
  }
  return lines.join('\n');
}


function summarisePlan(plan, dataset, state, options) {
  const t = plan.totals;
  const types = {};
  for (const item of plan.questions) types[item.payload.questionType] = (types[item.payload.questionType] || 0) + 1;
  const h = plan.hierarchy;
  const knownSame = plan.questions.filter((i) => {
    const s = state.get('question', i.payload.sourceKey);
    return s && s.hash === i.hash;
  }).length;
  const imagesKnown = plan.images.filter((i) => state.acknowledged('image', i.name)).length;
  const concurrency = options.concurrency || 1;
  const imageConcurrency = options.imageConcurrency || 1;
  const questionBatches = Math.ceil((plan.questions.length - knownSame) / options.batch);
  const examsKnown = plan.exams.filter((e) => (state.get('exam', e.sourceKey) || {}).hash === e.hash).length;
  const examBatches = Math.ceil((plan.exams.length - examsKnown) / EXAMS_PER_REQUEST);
  const hierarchyUnchanged = !options.force && (state.get('hierarchy', 'hierarchy') || {}).hash === hierarchyHash(h, options.updateHierarchy);
  const hierarchyRequests = hierarchyUnchanged ? 0 : Math.max(1, Math.ceil(h.courses.length / COURSES_PER_HIERARCHY_REQUEST));
  const imageUploads = plan.images.length - imagesKnown;
  const checkRequests = Math.ceil(imageUploads / MEDIA_CHECK_SIZE);
  const stateRequests = state.loaded ? 0 : Math.ceil(plan.questions.length / STATE_QUERY_SIZE);
  const verifyRequests = Math.ceil(plan.questions.length / STATE_QUERY_SIZE) + Math.ceil(plan.images.length / MEDIA_CHECK_SIZE) + 1;
  const requests = 1 + hierarchyRequests + checkRequests + imageUploads + stateRequests + questionBatches + examBatches + verifyRequests;
  const lines = [
    `Plan (${plan.mode}):`,
    `  questions      ${fmt(t.questions)} (published ${fmt(t.published)}, unpublished ${fmt(t.unpublished)}, with English ${fmt(t.withEnglish)})`,
    `  types          ${Object.entries(types).sort().map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`,
    `  hierarchy      ${h.universities.length} universities, ${h.sources.length} sources, ${h.studyPacks.length} study packs, ${h.unites.length} unites, ${fmt(h.modules.length)} modules, ${fmt(h.courses.length)} courses${hierarchyUnchanged ? ' (unchanged since the last acknowledged import)' : ''}`,
    `  images         ${fmt(plan.images.length)} distinct (${fmt(imagesKnown)} already acknowledged in the state file)`,
    `  exams          ${fmt(plan.exams.length)} module exam papers (${plan.examErrors.length} without a usable year or module; ${fmt(examsKnown)} acknowledged in the state file)`,
    `  state          ${state.loaded ? `${fmt(knownSame)} questions unchanged since the last acknowledged import` : 'no state file yet (the API will be asked for known hashes)'}`,
    `  requests       about ${fmt(requests)}: ${fmt(questionBatches)} question batches of up to ${options.batch} (${concurrency} in flight), at most ${fmt(imageUploads)} image uploads (${imageConcurrency} in flight), ${fmt(examBatches)} exam batches, ${fmt(verifyRequests)} to verify${options.minDelayMs ? `; at least ${options.minDelayMs} ms between request starts` : ''}`,
    '',
    countTable('By source (university x kind):', t.bySource),
    '',
    countTable('By university:', t.byUniversity),
    '',
    countTable('By study pack (questions with a course):', t.byPack),
    '',
    'Residency questions by university and part:',
    ...Object.keys(t.residency).sort().map((k) => `  ${k.padEnd(45)} ${fmt(t.residency[k]).padStart(6)}`),
  ];
  if (plan.coverage) {
    lines.push('', 'Sample coverage:');
    for (const [name, value] of Object.entries(plan.coverage)) lines.push(`  ${name.padEnd(55)} ${value || 'NOT FOUND'}`);
  }
  return {
    text: lines.join('\n'),
    estimate: { requests, questionBatches, examBatches, hierarchyRequests, imageChecks: checkRequests, imageUploads, stateRequests, verifyRequests, unchangedQuestions: knownSame },
  };
}

// Never let credentials reach the report
function sanitizeOptions(options) {
  const rest = { ...options, credentials: Boolean(options.email && options.password) };
  delete rest.email;
  delete rest.password;
  return rest;
}

async function phaseQuestions(ctx, deferred) {
  const { plan, state, options, report, log, shouldStop, progress } = ctx;
  const counts = report.phase('questions');
  counts.total = plan.questions.length;
  const ready = [];
  for (const item of plan.questions) {
    const blocked = item.imagePaths.map(imageName).filter((n) => deferred.has(n));
    if (blocked.length) {
      report.failure('questions', item.payload.sourceKey, `not sent: image upload failed for ${blocked.join(', ')}`);
      counts.deferred = (counts.deferred || 0) + 1;
    } else {
      ready.push(item);
    }
  }

  if (!options.force) {
    const unknown = ready.filter((i) => !state.has('question', i.payload.sourceKey)).map((i) => i.payload.sourceKey);
    if (unknown.length) {
      log(`  asking the API for the state of ${fmt(unknown.length)} questions not in the state file`);
      const server = await fetchQuestionState(ctx, unknown);
      if (shouldStop()) return;
      let known = 0;
      for (const [key, s] of server) {
        if (s.contentHash) {
          state.put('question', key, { hash: s.contentHash, id: s.id });
          known++;
        }
      }
      state.flush();
      counts.knownFromApi = known;
    }
  }

  const pending = ready.filter((i) => options.force || (state.get('question', i.payload.sourceKey) || {}).hash !== i.hash);
  counts.skippedUnchanged = ready.length - pending.length;
  counts.sent = 0;
  log(`  ${fmt(pending.length)} to send, ${fmt(counts.skippedUnchanged)} unchanged (batches of up to ${options.batch}, ${options.concurrency} in flight)`);
  if (!pending.length) return;
  if (progress) progress.begin('questions', pending.length, 'questions');
  await sendQuestions(ctx, pending, counts);
  if (progress) progress.end();
  log(`  questions ${fmt(counts.sent)}/${fmt(pending.length)} sent (created ${fmt(counts.created)}, updated ${fmt(counts.updated)}, unchanged ${fmt(counts.unchanged)}, failed ${fmt(counts.failed)})`);
}

async function phaseExams(ctx) {
  const { plan, state, options, report, log, progress } = ctx;
  const counts = report.phase('exams');
  counts.total = plan.exams.length + plan.examErrors.length;
  for (const e of plan.examErrors) {
    report.failure('exams', e.sourceKey, e.error);
    counts.failed = (counts.failed || 0) + 1;
  }
  const pending = plan.exams.filter((e) => options.force || (state.get('exam', e.sourceKey) || {}).hash !== e.hash);
  counts.skippedUnchanged = plan.exams.length - pending.length;
  if (!pending.length) {
    log(`  ${fmt(counts.skippedUnchanged)} unchanged, none to send`);
    return;
  }
  if (progress) progress.begin('exams', pending.length, 'exams');
  await sendExams(ctx, pending, counts);
  if (progress) progress.end();
  log(`  exams ${fmt(counts.created)} created, ${fmt(counts.updated)} updated, ${fmt(counts.unchanged)} unchanged, ${fmt(counts.failed)} failed, ${fmt(counts.incomplete)} incomplete`);
}

async function phaseReconcile({ api, plan, report, log }) {
  const res = await api.request('GET', '/admin/import/stats');
  const result = compare(plan.totals, res.data, plan.mode);
  report.set('reconciliation', { mode: plan.mode, mismatches: result.mismatches, rows: result.rows, serverStats: res.data });
  log(formatTable(result.rows));
  const na = result.rows.filter((r) => r.status === 'n/a').length;
  log(`Reconciliation: ${result.mismatches} mismatch(es)${na ? `, ${na} figure(s) not reported by the server` : ''}${plan.mode === 'sample' ? ' (sample mode: server must hold at least the sample)' : ''}`);
  return result.mismatches;
}

// Defaults of the CLI (import.js), for callers of run() that leave options out
const DEFAULTS = { batch: 200, concurrency: 4, imageConcurrency: 8, minDelayMs: 0, maxDelayMs: 60000, slowMs: 30000, timeoutMs: 180000, retries: 8, repairRounds: 3, progressSec: 30 };

/**
 * Runs the importer. Returns the process exit code:
 * 0 ok, 1 fatal error / invalid dataset, 2 some items failed, 3 reconciliation mismatch,
 * 4 verification failed (items still missing or different on the server after the repairs),
 * 130 interrupted.
 */
async function run(givenOptions, io = {}) {
  const options = { ...givenOptions };
  for (const [k, v] of Object.entries(DEFAULTS)) if (options[k] === undefined || options[k] === null) options[k] = v;
  const log = io.log || ((m) => console.log(m));
  const report = new Report(sanitizeOptions(options));
  const startedAt = Date.now();
  let stopping = false;
  const shouldStop = () => stopping;
  const onSignal = () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('Stopping after the requests in flight (signal again to quit now)...');
  };
  if (io.handleSignals !== false) {
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }
  let state;
  let progress = null;
  let verdict = null;
  const finish = (code) => {
    if (progress) progress.stop();
    if (io.handleSignals !== false) {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
    report.set('seconds', Math.round((Date.now() - startedAt) / 100) / 10);
    report.write(options.report, code);
    if (state) state.unlock();
    if (options.report) log(`Report written to ${options.report}`);
    // The verdict is the last line of a run
    if (verdict) log(verdict);
    return code;
  };
  const timed = async (name, fn) => {
    const t = Date.now();
    const result = await fn();
    report.phase(name).seconds = Math.round((Date.now() - t) / 100) / 10;
    return result;
  };

  try {
    const t0 = Date.now();
    log(`Reading ${options.dataset}`);
    const dataset = loadDataset(options.dataset, { log });
    const validate = report.phase('validate');
    Object.assign(validate, { files: dataset.index.files.length, questions: dataset.records.length, papers: dataset.papers.length, paperRefs: dataset.refs, errors: dataset.errors.length, warnings: dataset.warnings.length, seconds: Math.round((Date.now() - t0) / 1000) });
    for (const e of dataset.errors) report.failure('validate', e.key, e.error);
    for (const w of dataset.warnings) report.warning('validate', w.key, w.warning);
    log(`  ${fmt(validate.files)} files, ${fmt(validate.questions)} questions, ${validate.papers} papers, ${validate.errors} error(s), ${validate.warnings} warning(s)`);
    for (const e of dataset.errors.slice(0, 20)) log(`  error ${e.key}: ${e.error}`);
    if (dataset.errors.length && !options.dryRun && !options.ignoreErrors) {
      log('The dataset has errors; fix them or pass --ignore-errors.');
      return finish(1);
    }

    state = new StateStore(options.state, { readOnly: options.dryRun }).lock().load();
    if (!options.dryRun && state.compact()) log('  state file compacted');

    const selection = selectRecords(dataset, options.mode);
    const imagesDir = path.join(options.dataset, 'images');
    let imageStatus = null;
    const imagePaths = referencedImagePaths(selection.records);
    if (fs.existsSync(imagesDir)) {
      log(`Checking ${fmt(imagePaths.length)} images${options.skipImageHash ? ' (no hashing)' : ''}`);
      const known = new Set([...state.entries.values()].filter((e) => e.type === 'image' && !e.missing).map((e) => e.key));
      imageStatus = verifyImages(options.dataset, imagePaths, { hash: !options.skipImageHash, known, log });
      const bad = [...imageStatus.values()].filter((s) => !s.ok);
      report.phase('validate').invalidImages = bad.length;
      for (const [p, s] of imageStatus) if (!s.ok) report.warning('validate', p, s.reason);
      log(`  ${bad.length} image(s) unusable`);
    } else if (imagePaths.length && !options.dryRun && (!options.phases || options.phases.includes('media') || options.phases.includes('verify'))) {
      log(`No images directory at ${imagesDir}.`);
      return finish(1);
    } else if (imagePaths.length) {
      report.warning('validate', imagesDir, 'images directory not found: image files not checked');
      log('  images directory not found: image files not checked');
    }

    const plan = buildPlan(dataset, selection, { imageStatus });
    for (const w of plan.warnings) report.warning(w.phase, w.key, w.warning);
    for (const e of plan.errors) {
      report.failure(e.phase, e.key, e.error);
      log(`  error ${e.key}: ${e.error}`);
    }
    const summary = summarisePlan(plan, dataset, state, options);
    report.set('plan', { mode: plan.mode, totals: plan.totals, estimate: summary.estimate, coverage: plan.coverage, hierarchy: Object.fromEntries(Object.entries(plan.hierarchy).map(([k, v]) => [k, v.length])) });
    log(summary.text);
    if (options.printModules) log(moduleTable(dataset, plan));
    if (plan.warnings.length) log(`  ${plan.warnings.length} plan warning(s) (see the report)`);

    if (options.dryRun) {
      log('Dry run: no request sent.');
      return finish(dataset.errors.length || plan.errors.length ? 1 : 0);
    }
    if (plan.errors.length && !options.ignoreErrors) {
      log('The plan has errors; fix them or pass --ignore-errors.');
      return finish(1);
    }

    const api = new ApiClient({
      baseUrl: options.api,
      email: options.email,
      password: options.password,
      concurrency: options.concurrency,
      imageConcurrency: options.imageConcurrency,
      minDelayMs: options.minDelayMs,
      maxDelayMs: options.maxDelayMs,
      slowMs: options.slowMs,
      retries: options.retries,
      timeoutMs: options.timeoutMs,
      log,
      fetch: io.fetch,
    });
    report.set('api', api.stats);
    progress = new Progress({ log, intervalMs: Math.round(options.progressSec * 1000), api }).start();
    log(`Logging in to ${options.api}`);
    await api.login();

    const ctx = { api, plan, state, options, report, log, shouldStop, progress, datasetDir: options.dataset };
    const phases = options.phases || PHASES;
    let deferred = new Set();
    if (phases.includes('hierarchy') && !stopping) {
      log('Phase hierarchy');
      await timed('hierarchy', () => sendHierarchy(ctx));
    }
    if (phases.includes('media') && !stopping) {
      log(`Phase media (${fmt(plan.images.length)} images, ${options.imageConcurrency} uploads in flight)`);
      deferred = await timed('media', () => syncImages({ api, datasetDir: options.dataset, items: plan.images, state, report, log, shouldStop, concurrency: options.imageConcurrency, progress }));
    }
    if (phases.includes('questions') && !stopping) {
      log(`Phase questions (${fmt(plan.questions.length)})`);
      await timed('questions', () => phaseQuestions(ctx, deferred));
    }
    if (phases.includes('exams') && !stopping) {
      log(`Phase exams (${fmt(plan.exams.length)})`);
      await timed('exams', () => phaseExams(ctx));
    }
    let mismatches = 0;
    let itemsClean = true;
    let verifiedKeys = null;
    if (phases.includes('verify') && !stopping) {
      log('Phase verify');
      const result = await timed('verify', () => phaseVerify(ctx, plan));
      ({ mismatches, itemsClean, verifiedKeys } = result);
      verdict = result.verdict;
    } else if (phases.includes('reconcile') && !stopping) {
      log('Phase reconcile');
      mismatches = await timed('reconcile', () => phaseReconcile(ctx));
    }
    state.flush();
    api.updateConcurrencyStats();
    if (stopping) {
      verdict = null;
      return finish(130);
    }
    const failures = report.data.failureCount;
    // After a verification, a failure whose item ended up verified was repaired
    const unresolved = verifiedKeys
      ? report.data.failures.filter((f) => !verifiedKeys.has(f.key)).length + (failures - report.data.failures.length)
      : failures;
    report.set('unresolvedFailures', unresolved);
    log(`Done in ${formatDuration(Date.now() - startedAt)}: ${failures} failure(s)${verifiedKeys ? ` (${unresolved} unresolved)` : ''}, ${mismatches} reconciliation mismatch(es), ${fmt(api.stats.requests)} requests, ${fmt(api.stats.retries)} retries.`);
    return finish(!itemsClean ? 4 : mismatches ? 3 : unresolved ? 2 : 0);
  } catch (error) {
    if (state) {
      try {
        state.flush();
      } catch (flushError) {
        log(`Could not write the state file: ${flushError.message}`);
      }
    }
    verdict = null;
    report.failure('fatal', '-', error.message);
    log(`Fatal: ${error.message}`);
    return finish(1);
  }
}

module.exports = { run, PHASES, summarisePlan };
