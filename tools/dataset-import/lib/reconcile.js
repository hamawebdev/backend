'use strict';

const { normalizeName } = require('./normalize');
const { packKeyForModule } = require('./hierarchy');

function emptyCounts(name) {
  return { name, questions: 0, published: 0, unpublished: 0, withEnglish: 0 };
}

function add(counts, item) {
  counts.questions++;
  if (item.payload.isPublished) counts.published++;
  else counts.unpublished++;
  if (item.payload.questionTextEn) counts.withEnglish++;
}

/**
 * Totals of what this run imports, in the shape the reconciliation compares:
 * overall, per university, per source (university x kind), per study pack, exams,
 * residency questions per university and part, images.
 */
function localTotals(plan) {
  const { hierarchy } = plan;
  const names = new Map();
  for (const list of [hierarchy.universities, hierarchy.sources, hierarchy.studyPacks]) for (const e of list) names.set(e.sourceKey, e.name);
  const courseModule = new Map(hierarchy.courses.map((c) => [c.sourceKey, c.moduleKey]));

  const totals = { ...emptyCounts('all'), byUniversity: {}, bySource: {}, byPack: {}, residency: {}, exams: plan.exams.length, images: plan.images.length };
  const examQuestions = new Set();
  for (const exam of plan.exams) for (const key of exam.payload.questionKeys) examQuestions.add(key);
  for (const item of plan.questions) {
    const p = item.payload;
    add(totals, item);
    const u = p.universityKey || 'none';
    add(totals.byUniversity[u] || (totals.byUniversity[u] = emptyCounts(names.get(u) || 'Sans université')), item);
    const s = p.questionSourceKey;
    add(totals.bySource[s] || (totals.bySource[s] = emptyCounts(names.get(s) || s)), item);
    const pack = p.courseKey ? packKeyForModule(courseModule.get(p.courseKey)) : null;
    if (pack) add(totals.byPack[pack] || (totals.byPack[pack] = emptyCounts(names.get(pack) || pack)), item);
    // Residency content as the platform defines it (residencyQuestionWhere): a university,
    // an exam year, and a course in the RESIDENCY pack or no course and no exam
    const residency = p.courseKey ? pack === 'pack:residanat' : !examQuestions.has(p.sourceKey);
    if (p.universityKey && Number.isInteger(p.examYear) && residency) {
      const key = `${u}|${(p.metadata && p.metadata.part) || 'none'}`;
      totals.residency[key] = (totals.residency[key] || 0) + 1;
    }
  }
  return totals;
}

// ---- server side: GET /admin/import/stats. The contract fixes the content, not the
// exact shape, so the reader accepts the usual variants (arrays of rows or maps).

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (v && typeof v === 'object') {
    for (const k of ['total', 'count', 'questions', '_count']) if (k in v) return num(v[k]);
  }
  return undefined;
}

function rows(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((r) => r && typeof r === 'object');
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { key: k, ...v } : { key: k, questions: v }));
  }
  return [];
}

function rowCounts(row) {
  const pick = (...keys) => {
    for (const k of keys) if (row[k] !== undefined) return num(row[k]);
    return undefined;
  };
  return {
    questions: pick('questions', 'total', 'count', 'questionCount', '_count'),
    published: pick('published', 'publishedQuestions'),
    unpublished: pick('unpublished', 'unpublishedQuestions'),
    withEnglish: pick('withEnglish', 'english', 'translated'),
  };
}

function rowIds(row) {
  return [row.sourceKey, row.key, row.universityKey, row.questionSourceKey, row.studyPackKey, row.name, row.universityName, row.sourceName, row.studyPackName, row.university, row.source, row.pack]
    .filter((v) => typeof v === 'string')
    .map((v) => normalizeName(v));
}

function findRow(list, key, name) {
  // Questions without a university/pack come back as a row whose identifiers are null
  if (key === 'none') return list.find((row) => rowIds(row).length === 0 || rowIds(row).includes('none'));
  const wanted = [normalizeName(key), normalizeName(name)];
  return list.find((row) => rowIds(row).some((id) => wanted.includes(id)));
}

function first(obj, keys) {
  for (const k of keys) if (obj && obj[k] !== undefined) return obj[k];
  return undefined;
}

function imagesCount(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return num(first(value, ['files', 'total', 'count']));
  return num(value);
}

function serverView(stats) {
  const s = stats || {};
  let totals = first(s, ['totals', 'total', 'questions']);
  if (typeof totals === 'number') totals = { questions: totals };
  totals = totals || {};
  return {
    totals: {
      questions: num(first(totals, ['questions', 'total', 'count'])),
      published: num(first(totals, ['published'])),
      unpublished: num(first(totals, ['unpublished'])),
      withEnglish: num(first(totals, ['withEnglish', 'english'])),
    },
    byUniversity: rows(first(s, ['byUniversity', 'universities', 'questionsByUniversity'])),
    bySource: rows(first(s, ['bySource', 'sources', 'questionSources', 'questionsBySource'])),
    byPack: rows(first(s, ['byPack', 'byStudyPack', 'studyPacks', 'packs', 'questionsByPack'])),
    exams: num(first(s, ['exams', 'examCount'])),
    images: imagesCount(first(s, ['images', 'imageCount', 'media'])),
    residency: first(s, ['residency', 'residencyByUniversityPart', 'residencyByUniversity']),
  };
}

function flattenResidency(value) {
  // Accepts [{university|universityKey|name, part, count}] or {univ: {part: n}} or {"univ|part": n}
  const out = new Map();
  if (!value) return out;
  const put = (u, part, n) => {
    if (n === undefined) return;
    const key = `${normalizeName(u)}|${normalizeName(part || 'none')}`;
    out.set(key, (out.get(key) || 0) + n);
  };
  if (Array.isArray(value)) {
    for (const row of value) {
      if (!row || typeof row !== 'object') continue;
      const u = row.universityKey || row.university || row.universityName || row.name || row.key;
      if (row.parts) {
        for (const r of rows(row.parts)) put(u, r.part || r.key, rowCounts(r).questions);
      } else {
        put(u, row.part, num(first(row, ['count', 'total', 'questions'])));
      }
    }
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (v && typeof v === 'object') {
        const inner = v.parts || v.byPart || v;
        for (const [part, n] of Object.entries(inner)) if (num(n) !== undefined) put(k, part, num(n));
      } else if (k.includes('|')) {
        const [u, part] = k.split('|');
        put(u, part, num(v));
      }
    }
  }
  return out;
}

/**
 * Compares local totals with the server's. mode 'full' requires equality, mode
 * 'sample' only requires the server to hold at least the sample.
 * Returns { rows: [{ group, name, metric, local, server, status }], mismatches }.
 */
function compare(local, stats, mode) {
  const server = serverView(stats);
  const out = [];
  const check = (group, name, metric, l, s) => {
    let status;
    if (s === undefined) status = 'n/a';
    else if (mode === 'sample') status = s >= l ? 'ok' : 'MISMATCH';
    else status = s === l ? 'ok' : 'MISMATCH';
    out.push({ group, name, metric, local: l, server: s, status });
  };
  const metrics = ['questions', 'published', 'unpublished', 'withEnglish'];
  for (const m of metrics) check('total', 'all', m, local[m], server.totals[m]);
  const groups = [['university', local.byUniversity, server.byUniversity], ['source', local.bySource, server.bySource], ['pack', local.byPack, server.byPack]];
  for (const [group, mine, theirs] of groups) {
    for (const key of Object.keys(mine).sort()) {
      const row = findRow(theirs, key, mine[key].name);
      const counts = row ? rowCounts(row) : {};
      for (const m of metrics) check(group, `${mine[key].name} (${key})`, m, mine[key][m], counts[m]);
    }
  }
  check('exams', 'all', 'count', local.exams, server.exams);
  check('images', 'all', 'count', local.images, server.images);
  const residency = flattenResidency(server.residency);
  for (const key of Object.keys(local.residency).sort()) {
    const [u, part] = key.split('|');
    const candidates = [`${normalizeName(u)}|${normalizeName(part)}`, `${normalizeName(u.replace(/^univ:/, ''))}|${normalizeName(part)}`];
    const found = candidates.map((c) => residency.get(c)).find((v) => v !== undefined);
    check('residency', key, 'count', local.residency[key], residency.size ? found || 0 : undefined);
  }
  return { rows: out, mismatches: out.filter((r) => r.status === 'MISMATCH').length };
}

// One line per group entry: local/server for each metric, then the verdict
function formatTable(rowsList) {
  const metrics = [];
  const lines = new Map();
  for (const r of rowsList) {
    if (!metrics.includes(r.metric)) metrics.push(r.metric);
    const id = `${r.group}\u0000${r.name}`;
    const line = lines.get(id) || { group: r.group, name: r.name, cells: {}, status: 'ok' };
    line.cells[r.metric] = `${r.local}/${r.server === undefined ? '-' : r.server}`;
    if (r.status === 'MISMATCH') line.status = 'MISMATCH';
    else if (r.status === 'n/a' && line.status === 'ok') line.status = 'n/a';
    lines.set(id, line);
  }
  const header = ['group', 'name', ...metrics, 'status'];
  const data = [...lines.values()].map((l) => [l.group, l.name, ...metrics.map((m) => l.cells[m] || ''), l.status]);
  const widths = header.map((h, i) => Math.max(h.length, ...data.map((d) => d[i].length)));
  const fmtLine = (cells) => cells.map((c, i) => (i >= 2 && i < cells.length - 1 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();
  return ['Counts are local/server.', fmtLine(header), fmtLine(widths.map((w) => '-'.repeat(w))), ...data.map(fmtLine)].join('\n');
}

module.exports = { localTotals, compare, formatTable, serverView, flattenResidency };
