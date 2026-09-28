'use strict';

// Minimal in-memory implementation of the MedADN import API contract, for tests.

const http = require('http');
const crypto = require('crypto');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const parts = {};
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    const next = buffer.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = buffer.slice(start + boundary.length + 2, next - 2); // skip CRLF after boundary and before next
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.slice(0, split).toString('utf8');
      const body = part.slice(split + 4);
      const name = /name="([^"]+)"/.exec(head);
      const filename = /filename="([^"]*)"/.exec(head);
      if (name) parts[name[1]] = filename ? { filename: filename[1], data: body } : body.toString('utf8');
    }
    start = next;
  }
  return parts;
}

// faults: { '<METHOD> <path>': [status, ...] } answers the next calls of that route with
// those statuses; expireTokensAtCall: n invalidates every access token at the n-th call.
function createMockApi({ email = 'importer@example.test', password = 'secret', accessTtlSec = 900, faults = {}, expireTokensAtCall = 0 } = {}) {
  const db = {
    universities: new Map(),
    sources: new Map(),
    studyPacks: new Map(),
    unites: new Map(),
    modules: new Map(),
    courses: new Map(),
    questions: new Map(),
    exams: new Map(),
    media: new Map(),
  };
  const calls = [];
  const counters = { questionPayloads: 0, uploads: 0, logins: 0, refreshes: 0, unauthorized: 0 };
  let nextId = 1;
  const accessTokens = new Map(); // token -> expiresAt ms
  let refreshToken = null;
  const pending = { ...faults };

  const issue = () => {
    const exp = Math.floor(Date.now() / 1000) + accessTtlSec;
    const accessToken = `${b64url({ alg: 'none' })}.${b64url({ sub: 1, role: 'ADMIN', exp, n: nextId++ })}.sig`;
    accessTokens.set(accessToken, exp * 1000);
    refreshToken = crypto.randomBytes(12).toString('hex');
    return { accessToken, refreshToken };
  };

  const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: { message: data } }));
  };

  const upsertGroup = (group, list, parent) => {
    const ids = {};
    for (const e of list || []) {
      if (parent) {
        const [field, map] = parent;
        if (!db[map].has(e[field])) throw new Error(`${group} ${e.sourceKey}: unknown ${field} ${e[field]}`);
      }
      const existing = db[group].get(e.sourceKey);
      if (existing) ids[e.sourceKey] = existing.id;
      else {
        const id = nextId++;
        db[group].set(e.sourceKey, { ...e, id });
        ids[e.sourceKey] = id;
      }
    }
    return ids;
  };

  const stats = () => {
    const totals = { questions: 0, published: 0, unpublished: 0, withEnglish: 0 };
    const byUniversity = new Map();
    const bySource = new Map();
    const byPack = new Map();
    const residency = new Map();
    const bump = (map, key, name, q) => {
      const row = map.get(key) || { sourceKey: key, name, questions: 0, published: 0, unpublished: 0, withEnglish: 0 };
      row.questions++;
      row[q.isPublished ? 'published' : 'unpublished']++;
      if (q.questionTextEn) row.withEnglish++;
      map.set(key, row);
    };
    for (const q of db.questions.values()) {
      totals.questions++;
      totals[q.isPublished ? 'published' : 'unpublished']++;
      if (q.questionTextEn) totals.withEnglish++;
      const u = q.universityKey && db.universities.get(q.universityKey);
      bump(byUniversity, q.universityKey || 'none', u ? u.name : 'none', q);
      const s = db.sources.get(q.questionSourceKey);
      bump(bySource, q.questionSourceKey, s ? s.name : '?', q);
      if (q.courseKey) {
        const course = db.courses.get(q.courseKey);
        const module = course && db.modules.get(course.moduleKey);
        const unite = module && db.unites.get(module.uniteKey);
        const pack = unite && db.studyPacks.get(unite.studyPackKey);
        if (pack) bump(byPack, pack.sourceKey, pack.name, q);
      }
      if (/:residanat$/.test(q.questionSourceKey || '')) {
        const key = `${q.universityKey}|${(q.metadata && q.metadata.part) || ''}`;
        residency.set(key, (residency.get(key) || 0) + 1);
      }
    }
    return {
      totals,
      byUniversity: [...byUniversity.values()],
      bySource: [...bySource.values()],
      byPack: [...byPack.values()],
      exams: { total: db.exams.size },
      residency: [...residency.entries()].map(([k, count]) => {
        const [universityKey, part] = k.split('|');
        return { universityKey, part: part || null, count };
      }),
      images: { total: db.media.size },
    };
  };

  const handle = async (req, res, raw) => {
    const url = new URL(req.url, 'http://x');
    const route = `${req.method} ${url.pathname.replace(/^\/api\/v1/, '')}`;
    let body;
    if ((req.headers['content-type'] || '').startsWith('application/json')) body = JSON.parse(raw.toString('utf8') || '{}');
    calls.push({ route, size: raw.length, at: Date.now() });
    if (expireTokensAtCall && calls.length === expireTokensAtCall) {
      for (const k of accessTokens.keys()) accessTokens.set(k, 0);
    }

    const fault = pending[route];
    if (fault && fault.length) {
      const status = fault.shift();
      return send(res, status, `injected ${status}`, status === 429 ? { 'retry-after': '0' } : {});
    }

    if (route === 'POST /auth/login') {
      counters.logins++;
      if (!body || body.email !== email || body.password !== password) return send(res, 401, 'Invalid email or password');
      return send(res, 200, { tokens: issue() });
    }
    if (route === 'POST /auth/refresh') {
      counters.refreshes++;
      if (!body || body.refreshToken !== refreshToken) return send(res, 401, 'Session expired');
      return send(res, 200, { tokens: issue() });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const expiresAt = accessTokens.get(token);
    if (!expiresAt || expiresAt < Date.now()) {
      counters.unauthorized++;
      return send(res, 401, 'Token expired');
    }

    try {
      switch (route) {
        case 'POST /admin/import/media/check':
          return send(res, 200, { existing: (body.files || []).filter((f) => db.media.has(f)) });
        case 'POST /admin/import/media': {
          const parts = parseMultipart(raw, req.headers['content-type']);
          if (!parts || !parts.file || !parts.sha1) return send(res, 400, 'file and sha1 are required');
          const actual = crypto.createHash('sha1').update(parts.file.data).digest('hex');
          if (actual !== parts.sha1) return send(res, 400, 'sha1 mismatch');
          const ext = parts.file.filename.split('.').pop();
          const name = `${actual}.${ext}`;
          const existed = db.media.has(name);
          db.media.set(name, { size: parts.file.data.length });
          counters.uploads++;
          return send(res, 200, { sha1: actual, url: `/api/v1/media/images/${name}`, size: parts.file.data.length, existed });
        }
        case 'PUT /admin/import/hierarchy': {
          const out = {};
          out.universities = upsertGroup('universities', body.universities);
          out.sources = upsertGroup('sources', body.sources);
          out.studyPacks = upsertGroup('studyPacks', body.studyPacks);
          out.unites = upsertGroup('unites', body.unites, ['studyPackKey', 'studyPacks']);
          out.modules = upsertGroup('modules', body.modules, ['uniteKey', 'unites']);
          out.courses = upsertGroup('courses', body.courses, ['moduleKey', 'modules']);
          return send(res, 200, out);
        }
        case 'PUT /admin/import/questions': {
          const list = body.questions || [];
          if (list.length > 200) return send(res, 400, 'at most 200 questions');
          const results = list.map((q) => {
            counters.questionPayloads++;
            if (q.courseKey && !db.courses.has(q.courseKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown course ${q.courseKey}` };
            if (q.universityKey && !db.universities.has(q.universityKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown university ${q.universityKey}` };
            if (q.questionSourceKey && !db.sources.has(q.questionSourceKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown source ${q.questionSourceKey}` };
            const existing = db.questions.get(q.sourceKey);
            if (existing && existing.contentHash === q.contentHash) return { sourceKey: q.sourceKey, id: existing.id, action: 'unchanged' };
            const id = existing ? existing.id : nextId++;
            db.questions.set(q.sourceKey, { ...q, id });
            return { sourceKey: q.sourceKey, id, action: existing ? 'updated' : 'created' };
          });
          return send(res, 200, { results });
        }
        case 'POST /admin/import/questions/state': {
          const keys = body.sourceKeys || [];
          if (keys.length > 5000) return send(res, 400, 'at most 5000 keys');
          const items = keys.filter((k) => db.questions.has(k)).map((k) => ({ sourceKey: k, id: db.questions.get(k).id, contentHash: db.questions.get(k).contentHash }));
          return send(res, 200, { items });
        }
        case 'PUT /admin/import/exams': {
          const list = body.exams || [];
          if (list.length > 50) return send(res, 400, 'at most 50 exams');
          const results = list.map((e) => {
            if (!db.modules.has(e.moduleKey)) return { sourceKey: e.sourceKey, action: 'failed', error: 'unknown module' };
            const missingQuestions = e.questionKeys.filter((k) => !db.questions.has(k));
            const existing = db.exams.get(e.sourceKey);
            const id = existing ? existing.id : nextId++;
            db.exams.set(e.sourceKey, { ...e, id });
            return { sourceKey: e.sourceKey, id, action: existing ? 'updated' : 'created', missingQuestions };
          });
          return send(res, 200, { results });
        }
        case 'GET /admin/import/stats':
          return send(res, 200, stats());
        default:
          return send(res, 404, `no route ${route}`);
      }
    } catch (error) {
      return send(res, 400, error.message);
    }
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      handle(req, res, Buffer.concat(chunks)).catch((error) => send(res, 500, error.message));
    });
  });

  return {
    db,
    calls,
    counters,
    server,
    start() {
      return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/api/v1`)));
    },
    stop() {
      if (server.closeAllConnections) server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createMockApi, parseMultipart };
