'use strict';

const fs = require('fs');
const path = require('path');
const { loadDataset } = require('./dataset');
const { selectRecords, referencedImagePaths, buildPlan } = require('./plan');
const { verifyImages, syncImages, imageName } = require('./images');
const { StateStore } = require('./state');
const { ApiClient } = require('./api');
const { Report } = require('./report');
const { compare, formatTable } = require('./reconcile');
const { chunk, formatDuration } = require('./util');

const PHASES = ['hierarchy', 'media', 'questions', 'exams', 'reconcile'];
const COURSES_PER_HIERARCHY_REQUEST = 2000;
const STATE_QUERY_SIZE = 5000;
const EXAMS_PER_REQUEST = 50;
const MIN_BATCH = 20;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;

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
  const imagesKnown = plan.images.filter((i) => state.has('image', i.name)).length;
  const questionBatches = Math.ceil((plan.questions.length - knownSame) / options.batch);
  const examBatches = Math.ceil(plan.exams.length / EXAMS_PER_REQUEST);
  const hierarchyRequests = Math.max(1, Math.ceil(h.courses.length / COURSES_PER_HIERARCHY_REQUEST));
  const checkRequests = Math.ceil((plan.images.length - imagesKnown) / 500);
  const stateRequests = state.loaded ? 0 : Math.ceil(plan.questions.length / STATE_QUERY_SIZE);
  const requests = 1 + hierarchyRequests + checkRequests + (plan.images.length - imagesKnown) + stateRequests + questionBatches + examBatches + 1;
  const lines = [
    `Plan (${plan.mode}):`,
    `  questions      ${fmt(t.questions)} (published ${fmt(t.published)}, unpublished ${fmt(t.unpublished)}, with English ${fmt(t.withEnglish)})`,
    `  types          ${Object.entries(types).sort().map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}`,
    `  hierarchy      ${h.universities.length} universities, ${h.sources.length} sources, ${h.studyPacks.length} study packs, ${h.unites.length} unites, ${fmt(h.modules.length)} modules, ${fmt(h.courses.length)} courses`,
    `  images         ${fmt(plan.images.length)} distinct (${fmt(imagesKnown)} already acknowledged in the state file)`,
    `  exams          ${fmt(plan.exams.length)} module exam papers (${plan.examErrors.length} without a usable year or module)`,
    `  state          ${state.loaded ? `${fmt(knownSame)} questions unchanged since the last acknowledged import` : 'no state file yet (the API will be asked for known hashes)'}`,
    `  requests       about ${fmt(requests)} (at least ${formatDuration(requests * options.minDelayMs)} at ${options.minDelayMs} ms between requests, before server time)`,
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
  return { text: lines.join('\n'), estimate: { requests, questionBatches, examBatches, hierarchyRequests, imageChecks: checkRequests, stateRequests, unchangedQuestions: knownSame } };
}

// Never let credentials reach the report
function sanitizeOptions(options) {
  const rest = { ...options, credentials: Boolean(options.email && options.password) };
  delete rest.email;
  delete rest.password;
  return rest;
}

async function phaseHierarchy({ api, plan, options, report, log }) {
  const counts = report.phase('hierarchy');
  const h = plan.hierarchy;
  const groups = ['universities', 'sources', 'studyPacks', 'unites', 'modules', 'courses'];
  for (const g of groups) counts[g] = h[g].length;
  const courseChunks = h.courses.length ? chunk(h.courses, COURSES_PER_HIERARCHY_REQUEST) : [[]];
  let missing = 0;
  for (let i = 0; i < courseChunks.length; i++) {
    const body = { ...h, courses: courseChunks[i], updateExisting: Boolean(options.updateHierarchy) };
    const res = await api.request('PUT', '/admin/import/hierarchy', { json: body });
    const data = res.data || {};
    for (const g of groups) {
      const sent = g === 'courses' ? courseChunks[i] : h[g];
      const ids = data[g] || {};
      for (const e of sent) {
        if (ids[e.sourceKey] === undefined || ids[e.sourceKey] === null) {
          missing++;
          report.warning('hierarchy', e.sourceKey, `no id returned for ${g} entry`);
        }
      }
    }
    log(`  hierarchy request ${i + 1}/${courseChunks.length} done`);
  }
  counts.requests = courseChunks.length;
  counts.missingIds = missing;
}

async function phaseQuestions({ api, plan, state, options, report, log, deferred, shouldStop }) {
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
      let known = 0;
      for (const keys of chunk(unknown, STATE_QUERY_SIZE)) {
        if (shouldStop()) return;
        const res = await api.request('POST', '/admin/import/questions/state', { json: { sourceKeys: keys } });
        for (const it of (res.data && res.data.items) || []) {
          if (it && it.sourceKey && it.contentHash) {
            state.put('question', it.sourceKey, { hash: it.contentHash, id: it.id });
            known++;
          }
        }
        state.flush();
      }
      counts.knownFromApi = known;
    }
  }

  const pending = ready.filter((i) => options.force || (state.get('question', i.payload.sourceKey) || {}).hash !== i.hash);
  counts.skippedUnchanged = ready.length - pending.length;
  counts.sent = 0;
  log(`  ${fmt(pending.length)} to send, ${fmt(counts.skippedUnchanged)} unchanged`);

  const queue = [];
  let size = options.batch;
  let fast = 0;
  let index = 0;
  const started = Date.now();
  let lastLog = 0;
  const nextBatch = () => {
    if (queue.length) return queue.shift();
    const batch = [];
    let bytes = 0;
    while (index < pending.length && batch.length < size) {
      const item = pending[index];
      const itemBytes = item.bytes || (item.bytes = Buffer.byteLength(JSON.stringify(item.payload)));
      if (batch.length && bytes + itemBytes > MAX_BATCH_BYTES) break;
      batch.push(item);
      bytes += itemBytes;
      index++;
    }
    return batch.length ? batch : null;
  };

  for (let batch = nextBatch(); batch; batch = nextBatch()) {
    if (shouldStop()) return;
    let res;
    try {
      res = await api.request('PUT', '/admin/import/questions', { json: { questions: batch.map((i) => i.payload) } });
    } catch (error) {
      if (error.status && error.status >= 400 && error.status < 500 && ![401, 403, 404, 429].includes(error.status)) {
        if (batch.length > 1) {
          const half = Math.ceil(batch.length / 2);
          queue.unshift(batch.slice(0, half), batch.slice(half));
          log(`  batch of ${batch.length} refused (${error.message}); splitting it`);
        } else {
          report.failure('questions', batch[0].payload.sourceKey, error.message);
          counts.failed = (counts.failed || 0) + 1;
        }
        continue;
      }
      throw error;
    }
    counts.sent += batch.length;
    const results = new Map(((res.data && res.data.results) || []).map((r) => [r.sourceKey, r]));
    for (const item of batch) {
      const r = results.get(item.payload.sourceKey);
      if (!r) {
        report.failure('questions', item.payload.sourceKey, 'no result returned for this question');
        counts.failed = (counts.failed || 0) + 1;
      } else if (r.action === 'failed') {
        report.failure('questions', item.payload.sourceKey, r.error || 'failed');
        counts.failed = (counts.failed || 0) + 1;
      } else {
        counts[r.action] = (counts[r.action] || 0) + 1;
        state.put('question', item.payload.sourceKey, { hash: item.hash, id: r.id });
      }
    }
    state.flush();

    if (res.latency > options.slowMs) {
      size = Math.max(MIN_BATCH, Math.floor(size / 2));
      fast = 0;
    } else if (++fast >= 3 && size < options.batch) {
      size = Math.min(options.batch, size + Math.ceil(options.batch / 8));
      fast = 0;
    }
    const done = counts.sent;
    const rate = done / Math.max(1, Date.now() - started);
    if (Date.now() - lastLog < 10000 && index < pending.length) continue;
    lastLog = Date.now();
    log(`  questions ${fmt(done)}/${fmt(pending.length)} sent (created ${fmt(counts.created)}, updated ${fmt(counts.updated)}, unchanged ${fmt(counts.unchanged)}, failed ${fmt(counts.failed)}); batch ${size}; ~${formatDuration((pending.length - done) / rate)} left`);
  }
}

async function phaseExams({ api, plan, state, options, report, log, shouldStop }) {
  const counts = report.phase('exams');
  counts.total = plan.exams.length + plan.examErrors.length;
  for (const e of plan.examErrors) {
    report.failure('exams', e.sourceKey, e.error);
    counts.failed = (counts.failed || 0) + 1;
  }
  const pending = plan.exams.filter((e) => options.force || (state.get('exam', e.sourceKey) || {}).hash !== e.hash);
  counts.skippedUnchanged = plan.exams.length - pending.length;
  const queue = chunk(pending, EXAMS_PER_REQUEST);
  while (queue.length) {
    if (shouldStop()) return;
    const batch = queue.shift();
    let res;
    try {
      res = await api.request('PUT', '/admin/import/exams', { json: { exams: batch.map((e) => e.payload) } });
    } catch (error) {
      if (error.status && error.status >= 400 && error.status < 500 && ![401, 403, 404, 429].includes(error.status)) {
        if (batch.length > 1) {
          const half = Math.ceil(batch.length / 2);
          queue.unshift(batch.slice(0, half), batch.slice(half));
        } else {
          report.failure('exams', batch[0].sourceKey, error.message);
          counts.failed = (counts.failed || 0) + 1;
        }
        continue;
      }
      throw error;
    }
    const results = new Map(((res.data && res.data.results) || []).map((r) => [r.sourceKey, r]));
    for (const exam of batch) {
      const r = results.get(exam.sourceKey);
      const missing = r && (Array.isArray(r.missingQuestions) ? r.missingQuestions.length : Number(r.missingQuestions) || 0);
      if (!r || r.action === 'failed') {
        report.failure('exams', exam.sourceKey, (r && r.error) || 'no result returned for this exam');
        counts.failed = (counts.failed || 0) + 1;
      } else {
        counts[r.action] = (counts[r.action] || 0) + 1;
        if (missing) {
          const list = Array.isArray(r.missingQuestions) ? `: ${r.missingQuestions.slice(0, 20).join(', ')}` : '';
          report.failure('exams', exam.sourceKey, `${missing} question(s) missing on the server${list}`);
          counts.incomplete = (counts.incomplete || 0) + 1;
        } else {
          state.put('exam', exam.sourceKey, { hash: exam.hash, id: r.id });
        }
      }
    }
    state.flush();
    log(`  exams ${fmt(counts.created)} created, ${fmt(counts.updated)} updated, ${fmt(counts.unchanged)} unchanged, ${fmt(counts.failed)} failed`);
  }
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

/**
 * Runs the importer. Returns the process exit code:
 * 0 ok, 1 fatal error / invalid dataset, 2 some items failed, 3 reconciliation mismatch.
 */
async function run(options, io = {}) {
  const log = io.log || ((m) => console.log(m));
  const report = new Report(sanitizeOptions(options));
  let stopping = false;
  const shouldStop = () => stopping;
  const onSignal = () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('Stopping after the current request (Ctrl-C again to quit now)...');
  };
  if (io.handleSignals !== false) process.on('SIGINT', onSignal);
  const finish = (code) => {
    if (io.handleSignals !== false) process.removeListener('SIGINT', onSignal);
    report.write(options.report, code);
    if (options.report) log(`Report written to ${options.report}`);
    return code;
  };

  let state;
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

    state = new StateStore(options.state, { readOnly: options.dryRun }).load();
    if (!options.dryRun && state.compact()) log('  state file compacted');

    const selection = selectRecords(dataset, options.mode);
    const imagesDir = path.join(options.dataset, 'images');
    let imageStatus = null;
    const imagePaths = referencedImagePaths(selection.records);
    if (fs.existsSync(imagesDir)) {
      log(`Checking ${fmt(imagePaths.length)} images${options.skipImageHash ? ' (no hashing)' : ''}`);
      const known = new Set([...state.entries.values()].filter((e) => e.type === 'image').map((e) => e.key));
      imageStatus = verifyImages(options.dataset, imagePaths, { hash: !options.skipImageHash, known, log });
      const bad = [...imageStatus.values()].filter((s) => !s.ok);
      report.phase('validate').invalidImages = bad.length;
      for (const [p, s] of imageStatus) if (!s.ok) report.warning('validate', p, s.reason);
      log(`  ${bad.length} image(s) unusable`);
    } else if (imagePaths.length && !options.dryRun && (!options.phases || options.phases.includes('media'))) {
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
      minDelayMs: options.minDelayMs,
      maxDelayMs: options.maxDelayMs,
      slowMs: options.slowMs,
      retries: options.retries,
      log,
      fetch: io.fetch,
    });
    report.set('api', api.stats);
    log(`Logging in to ${options.api}`);
    await api.login();

    const phases = options.phases || PHASES;
    let deferred = new Set();
    if (phases.includes('hierarchy') && !stopping) {
      log('Phase hierarchy');
      await phaseHierarchy({ api, plan, options, report, log });
    }
    if (phases.includes('media') && !stopping) {
      log(`Phase media (${fmt(plan.images.length)} images)`);
      deferred = await syncImages({ api, datasetDir: options.dataset, items: plan.images, state, report, log, shouldStop });
    }
    if (phases.includes('questions') && !stopping) {
      log(`Phase questions (${fmt(plan.questions.length)})`);
      await phaseQuestions({ api, plan, state, options, report, log, deferred, shouldStop });
    }
    if (phases.includes('exams') && !stopping) {
      log(`Phase exams (${fmt(plan.exams.length)})`);
      await phaseExams({ api, plan, state, options, report, log, shouldStop });
    }
    let mismatches = 0;
    if (phases.includes('reconcile') && !stopping) {
      log('Phase reconcile');
      mismatches = await phaseReconcile({ api, plan, report, log });
    }
    state.flush();
    if (stopping) return finish(130);
    const failures = report.data.failureCount;
    log(`Done: ${failures} failure(s), ${mismatches} reconciliation mismatch(es), ${api.stats.requests} requests.`);
    return finish(mismatches ? 3 : failures ? 2 : 0);
  } catch (error) {
    if (state) {
      try {
        state.flush();
      } catch (flushError) {
        log(`Could not write the state file: ${flushError.message}`);
      }
    }
    report.failure('fatal', '-', error.message);
    log(`Fatal: ${error.message}`);
    return finish(1);
  }
}

module.exports = { run, PHASES, summarisePlan };
