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

// faults: { '<METHOD> <path>': [fault, ...] } answers the next calls of that route with
// those faults, one per call. A fault is a status (answered without doing anything),
// 'reset' (the connection is dropped before anything is done), 'after:<status>' or
// 'after:reset' (the request is carried out, then the answer is lost: that status, or a
// dropped connection), or 'hang:<ms>' (carried out and answered after that delay, which
// a client timeout turns into a lost answer).
// expireTokensAtCall: n invalidates every access token at the n-th call;
// expireTokensOn: { route, n } does it at the n-th call of that route.
// latencyMs: a number or (route) => ms, spent before the request is looked at (so
// parallel requests really overlap on the server).
// rejectKeys: question sourceKeys the API always answers 'failed'.
function createMockApi({
  email = 'importer@example.test',
  password = 'secret',
  accessTtlSec = 900,
  faults = {},
  expireTokensAtCall = 0,
  expireTokensOn = null,
  latencyMs = 0,
  rejectKeys = [],
} = {}) {
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
  const counters = { questionPayloads: 0, uploads: 0, logins: 0, refreshes: 0, unauthorized: 0, created: 0, updated: 0, examWrites: 0, rejectedPayloads: 0 };
  const inflight = {};
  const maxInflight = {};
  const rejected = new Set(rejectKeys);
  const routeCalls = {};
  let nextId = 1;
  const accessTokens = new Map(); // token -> expiresAt ms
  let refreshToken = null;
  const pending = Object.fromEntries(Object.entries(faults).map(([k, v]) => [k, [...v]]));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const issue = () => {
    const exp = Math.floor(Date.now() / 1000) + accessTtlSec;
    const accessToken = `${b64url({ alg: 'none' })}.${b64url({ sub: 1, role: 'ADMIN', exp, n: nextId++ })}.sig`;
    accessTokens.set(accessToken, exp * 1000);
    refreshToken = crypto.randomBytes(12).toString('hex');
    return { accessToken, refreshToken };
  };

  const send = (res, status, data, headers = {}) => {
    if (res.destroyed || res.writableEnded || (res.socket && res.socket.destroyed)) return;
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

  const questionIds = () => new Set([...db.questions.values()].map((q) => q.id));

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
      exams: {
        total: db.exams.size,
        // links whose question still exists (a deleted question takes its links along)
        examQuestions: [...db.exams.values()].reduce((n, e) => n + e.linkedIds.filter((id) => questionIds().has(id)).length, 0),
      },
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
    const call = { route, size: raw.length, at: Date.now(), end: null };
    if (route === 'PUT /admin/import/questions' && body && Array.isArray(body.questions)) call.keys = body.questions.map((q) => q && q.sourceKey);
    calls.push(call);
    routeCalls[route] = (routeCalls[route] || 0) + 1;
    inflight[route] = (inflight[route] || 0) + 1;
    maxInflight[route] = Math.max(maxInflight[route] || 0, inflight[route]);
    let done = false;
    const finished = () => {
      if (done) return;
      done = true;
      inflight[route]--;
      call.end = Date.now();
    };
    res.on('finish', finished);
    res.on('close', finished);
    res.on('error', () => {});
    if ((expireTokensAtCall && calls.length === expireTokensAtCall) || (expireTokensOn && route === expireTokensOn.route && routeCalls[route] === expireTokensOn.n)) {
      for (const k of accessTokens.keys()) accessTokens.set(k, 0);
    }
    const wait = typeof latencyMs === 'function' ? latencyMs(route) : latencyMs;
    if (wait) await delay(wait);

    const fault = pending[route] && pending[route].length ? pending[route].shift() : null;
    if (typeof fault === 'number') return send(res, fault, `injected ${fault}`, fault === 429 ? { 'retry-after': '0' } : {});
    if (fault === 'reset') return req.socket.destroy();
    const [status, data, headers] = await dispatch(route, req, body, raw);
    if (typeof fault === 'string' && fault.startsWith('after:')) {
      const what = fault.slice('after:'.length);
      if (what === 'reset') return req.socket.destroy();
      return send(res, Number(what), `injected ${what} after the work was done`);
    }
    if (typeof fault === 'string' && fault.startsWith('hang:')) await delay(Number(fault.slice('hang:'.length)));
    return send(res, status, data, headers);
  };

  const reply = (status, data, headers = {}) => [status, data, headers];

  // Returns [status, data, headers]
  const dispatch = async (route, req, body, raw) => {
    if (route === 'POST /auth/login') {
      counters.logins++;
      if (!body || body.email !== email || body.password !== password) return reply(401, 'Invalid email or password');
      return reply(200, { tokens: issue() });
    }
    if (route === 'POST /auth/refresh') {
      counters.refreshes++;
      if (!body || body.refreshToken !== refreshToken) return reply(401, 'Session expired');
      return reply(200, { tokens: issue() });
    }

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const expiresAt = accessTokens.get(token);
    if (!expiresAt || expiresAt < Date.now()) {
      counters.unauthorized++;
      return reply(401, 'Token expired');
    }

    try {
      switch (route) {
        case 'POST /admin/import/media/check':
          return reply(200, { existing: (body.files || []).filter((f) => db.media.has(f)) });
        case 'POST /admin/import/media': {
          const parts = parseMultipart(raw, req.headers['content-type']);
          if (!parts || !parts.file || !parts.sha1) return reply(400, 'file and sha1 are required');
          const actual = crypto.createHash('sha1').update(parts.file.data).digest('hex');
          if (actual !== parts.sha1) return reply(400, 'sha1 mismatch');
          const ext = parts.file.filename.split('.').pop();
          const name = `${actual}.${ext}`;
          const existed = db.media.has(name);
          db.media.set(name, { size: parts.file.data.length });
          counters.uploads++;
          return reply(200, { sha1: actual, url: `/api/v1/media/images/${name}`, size: parts.file.data.length, existed });
        }
        case 'PUT /admin/import/hierarchy': {
          const out = {};
          out.universities = upsertGroup('universities', body.universities);
          out.sources = upsertGroup('sources', body.sources);
          out.studyPacks = upsertGroup('studyPacks', body.studyPacks);
          out.unites = upsertGroup('unites', body.unites, ['studyPackKey', 'studyPacks']);
          out.modules = upsertGroup('modules', body.modules, ['uniteKey', 'unites']);
          out.courses = upsertGroup('courses', body.courses, ['moduleKey', 'modules']);
          return reply(200, out);
        }
        case 'PUT /admin/import/questions': {
          const list = body.questions || [];
          if (list.length > 200) return reply(400, 'at most 200 questions');
          const results = list.map((q) => {
            counters.questionPayloads++;
            if (q.courseKey && !db.courses.has(q.courseKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown course ${q.courseKey}` };
            if (q.universityKey && !db.universities.has(q.universityKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown university ${q.universityKey}` };
            if (q.questionSourceKey && !db.sources.has(q.questionSourceKey)) return { sourceKey: q.sourceKey, action: 'failed', error: `unknown source ${q.questionSourceKey}` };
            const existing = db.questions.get(q.sourceKey);
            if (rejected.has(q.sourceKey)) counters.rejectedPayloads++;
            if (rejected.has(q.sourceKey)) return { sourceKey: q.sourceKey, id: existing ? existing.id : null, action: 'failed', error: 'rejected by the test' };
            if (existing && existing.contentHash === q.contentHash) return { sourceKey: q.sourceKey, id: existing.id, action: 'unchanged' };
            const id = existing ? existing.id : nextId++;
            db.questions.set(q.sourceKey, { ...q, id });
            counters[existing ? 'updated' : 'created']++;
            return { sourceKey: q.sourceKey, id, action: existing ? 'updated' : 'created' };
          });
          return reply(200, { results });
        }
        case 'POST /admin/import/questions/state': {
          const keys = body.sourceKeys || [];
          if (keys.length > 5000) return reply(400, 'at most 5000 keys');
          const items = keys.filter((k) => db.questions.has(k)).map((k) => ({ sourceKey: k, id: db.questions.get(k).id, contentHash: db.questions.get(k).contentHash }));
          return reply(200, { items });
        }
        case 'PUT /admin/import/exams': {
          const list = body.exams || [];
          if (list.length > 50) return reply(400, 'at most 50 exams');
          const results = list.map((e) => {
            if (!db.modules.has(e.moduleKey)) return { sourceKey: e.sourceKey, action: 'failed', error: 'unknown module' };
            // Like the API: keys not imported yet are reported and left out of the links
            const missingQuestions = e.questionKeys.filter((k) => !db.questions.has(k));
            const linkedIds = e.questionKeys.filter((k) => db.questions.has(k)).map((k) => db.questions.get(k).id);
            const existing = db.exams.get(e.sourceKey);
            const fields = (x) => JSON.stringify([x.title, x.description || null, x.moduleKey, x.universityKey, x.yearLevel, x.year, x.linkedIds]);
            if (existing && fields(existing) === fields({ ...e, linkedIds })) return { sourceKey: e.sourceKey, id: existing.id, action: 'unchanged', missingQuestions };
            const id = existing ? existing.id : nextId++;
            db.exams.set(e.sourceKey, { ...e, id, linkedIds });
            counters.examWrites++;
            return { sourceKey: e.sourceKey, id, action: existing ? 'updated' : 'created', missingQuestions };
          });
          return reply(200, { results });
        }
        case 'GET /admin/import/stats':
          return reply(200, stats());
        default:
          return reply(404, `no route ${route}`);
      }
    } catch (error) {
      return reply(400, error.message);
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
    inflight,
    maxInflight,
    rejected,
    server,
    faultsLeft() {
      return Object.values(pending).reduce((n, list) => n + list.length, 0);
    },
    expireTokens() {
      for (const k of accessTokens.keys()) accessTokens.set(k, 0);
    },
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
