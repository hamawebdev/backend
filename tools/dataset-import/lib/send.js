'use strict';

// Sending questions, exams and the hierarchy: used by their phases and by the repairs
// of the verify phase.

const { runPool } = require('./pool');
const { chunk, canonicalJson, sha256 } = require('./util');

const COURSES_PER_HIERARCHY_REQUEST = 2000;
const EXAMS_PER_REQUEST = 50;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const HIERARCHY_GROUPS = ['universities', 'sources', 'studyPacks', 'unites', 'modules', 'courses'];

const bump = (counts, name, n = 1) => {
  counts[name] = (counts[name] || 0) + n;
};

// A 4xx that concerns the payload (400, 413, 422...): splitting the batch isolates the bad item
function refusedPayload(error) {
  return Boolean(error.status && error.status >= 400 && error.status < 500 && ![401, 403, 404, 408, 429].includes(error.status));
}

/** Hash of the hierarchy request, so an unchanged hierarchy is not sent again */
function hierarchyHash(hierarchy, updateExisting) {
  return sha256(canonicalJson({ hierarchy, updateExisting: Boolean(updateExisting) }));
}

/**
 * PUT /admin/import/hierarchy, courses 2,000 per request, one request after the other
 * (every request carries the parents, which parallel requests would race to create).
 * Skipped when the state says this exact hierarchy was acknowledged, unless `force`.
 */
async function sendHierarchy({ api, plan, state, options, report, log }, { force = false } = {}) {
  const counts = report.phase('hierarchy');
  const h = plan.hierarchy;
  for (const g of HIERARCHY_GROUPS) counts[g] = h[g].length;
  const hash = hierarchyHash(h, options.updateHierarchy);
  if (!force && !options.force && (state.get('hierarchy', 'hierarchy') || {}).hash === hash) {
    counts.skippedUnchanged = true;
    log('  unchanged since the last acknowledged import: not sent');
    return;
  }
  const courseChunks = h.courses.length ? chunk(h.courses, COURSES_PER_HIERARCHY_REQUEST) : [[]];
  let missing = 0;
  for (let i = 0; i < courseChunks.length; i++) {
    const body = { ...h, courses: courseChunks[i], updateExisting: Boolean(options.updateHierarchy) };
    const res = await api.request('PUT', '/admin/import/hierarchy', { json: body });
    const data = res.data || {};
    for (const g of HIERARCHY_GROUPS) {
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
  counts.requests = (counts.requests || 0) + courseChunks.length;
  counts.missingIds = missing;
  if (!missing) {
    state.put('hierarchy', 'hierarchy', { hash });
    state.flush();
  }
}

/**
 * Sends question items ({ payload, hash }) with PUT /admin/import/questions: batches of
 * up to options.batch questions (and 4 MB), `options.concurrency` requests in flight,
 * batches handed out in plan order. A batch the API refuses as a whole (4xx) is split
 * in two until the bad question is alone and reported. Every acknowledged question
 * is written to the state as soon as its batch answers.
 * Adds to `counts` (sent, created, updated, unchanged, failed); returns the Set of
 * sourceKeys that failed.
 */
async function sendQuestions({ api, state, options, report, log, shouldStop, progress }, items, counts, phase = 'questions') {
  const failed = new Set();
  const queue = [];
  let index = 0;
  const next = () => {
    if (queue.length) return queue.shift();
    const batch = [];
    let bytes = 0;
    while (index < items.length && batch.length < options.batch) {
      const item = items[index];
      const itemBytes = item.bytes || (item.bytes = Buffer.byteLength(JSON.stringify(item.payload)));
      if (batch.length && bytes + itemBytes > MAX_BATCH_BYTES) break;
      batch.push(item);
      bytes += itemBytes;
      index++;
    }
    return batch.length ? batch : null;
  };
  const fail = (item, message) => {
    failed.add(item.payload.sourceKey);
    report.failure(phase, item.payload.sourceKey, message);
    bump(counts, 'failed');
  };

  await runPool({
    size: options.concurrency,
    next,
    shouldStop,
    worker: async (batch) => {
      let res;
      try {
        const json = { questions: batch.map((i) => i.payload) };
        res = await api.request('PUT', '/admin/import/questions', { json });
      } catch (error) {
        if (!refusedPayload(error)) throw error;
        if (batch.length > 1) {
          const half = Math.ceil(batch.length / 2);
          queue.unshift(batch.slice(0, half), batch.slice(half));
          log(`  batch of ${batch.length} refused (${error.message}); splitting it`);
        } else {
          fail(batch[0], error.message);
          if (progress) progress.add();
        }
        return;
      }
      bump(counts, 'sent', batch.length);
      const results = new Map(((res.data && res.data.results) || []).map((r) => [r.sourceKey, r]));
      for (const item of batch) {
        const key = item.payload.sourceKey;
        const r = results.get(key);
        if (!r) {
          fail(item, 'no result returned for this question');
        } else if (r.action === 'failed' || !['created', 'updated', 'unchanged'].includes(r.action)) {
          fail(item, r.error || `action ${r.action}`);
        } else {
          bump(counts, r.action);
          const before = state.get('question', key);
          if (before && before.id && r.id && before.id !== r.id) {
            report.warning(phase, key, `server id changed from ${before.id} to ${r.id} (${r.action})`);
            bump(counts, 'idChanged');
          }
          state.put('question', key, { hash: item.hash, id: r.id });
        }
      }
      state.flush();
      if (progress) progress.add(batch.length);
    },
  });
  return failed;
}

/**
 * Sends exams with PUT /admin/import/exams, 50 per request, `options.concurrency`
 * requests in flight. An exam is acknowledged in the state only when the server
 * linked every one of its questions. Adds to `counts`; returns
 * { failed: Set, changed: Set (created or updated) }.
 */
async function sendExams({ api, state, options, report, shouldStop, progress }, exams, counts, phase = 'exams') {
  const failed = new Set();
  const changed = new Set();
  const queue = chunk(exams, EXAMS_PER_REQUEST);
  const fail = (key, message) => {
    failed.add(key);
    report.failure(phase, key, message);
    bump(counts, 'failed');
  };
  await runPool({
    size: options.concurrency,
    next: () => (queue.length ? queue.shift() : null),
    shouldStop,
    worker: async (batch) => {
      let res;
      try {
        res = await api.request('PUT', '/admin/import/exams', { json: { exams: batch.map((e) => e.payload) } });
      } catch (error) {
        if (!refusedPayload(error)) throw error;
        if (batch.length > 1) {
          const half = Math.ceil(batch.length / 2);
          queue.unshift(batch.slice(0, half), batch.slice(half));
        } else {
          fail(batch[0].sourceKey, error.message);
          if (progress) progress.add();
        }
        return;
      }
      const results = new Map(((res.data && res.data.results) || []).map((r) => [r.sourceKey, r]));
      for (const exam of batch) {
        const r = results.get(exam.sourceKey);
        const missing = r && (Array.isArray(r.missingQuestions) ? r.missingQuestions.length : Number(r.missingQuestions) || 0);
        if (!r || r.action === 'failed') {
          fail(exam.sourceKey, (r && r.error) || 'no result returned for this exam');
          continue;
        }
        bump(counts, r.action);
        if (r.action === 'created' || r.action === 'updated') changed.add(exam.sourceKey);
        if (missing) {
          const list = Array.isArray(r.missingQuestions) ? `: ${r.missingQuestions.slice(0, 20).join(', ')}` : '';
          report.failure(phase, exam.sourceKey, `${missing} question(s) missing on the server${list}`);
          failed.add(exam.sourceKey);
          bump(counts, 'incomplete');
          state.putIfChanged('exam', exam.sourceKey, { hash: null, id: r.id });
        } else {
          state.put('exam', exam.sourceKey, { hash: exam.hash, id: r.id });
        }
      }
      state.flush();
      if (progress) progress.add(batch.length);
    },
  });
  return { failed, changed };
}

module.exports = { sendHierarchy, sendQuestions, sendExams, hierarchyHash, refusedPayload, COURSES_PER_HIERARCHY_REQUEST, EXAMS_PER_REQUEST, MAX_BATCH_BYTES };
