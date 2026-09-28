'use strict';

const fs = require('fs');
const path = require('path');
const { sha1, chunk } = require('./util');
const { runPool, fromList } = require('./pool');

const MAX_BYTES = 20 * 1024 * 1024;
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};
const URL_PREFIX = '/api/v1/media/images/';

function imageName(datasetPath) {
  return path.basename(datasetPath);
}

function imageUrlForName(name) {
  return URL_PREFIX + name;
}

/**
 * Checks every referenced image on disk: present, at most 20 MB, and (unless the
 * server already acknowledged it or hashing is off) content sha1 equal to its name.
 * Returns Map(datasetPath -> { ok, name, size, reason }).
 */
function verifyImages(datasetDir, paths, { hash = true, known = new Set(), log = () => {} } = {}) {
  const result = new Map();
  let hashed = 0;
  for (const p of paths) {
    const name = imageName(p);
    const [sha, ext] = name.split('.');
    const file = path.join(datasetDir, p);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      result.set(p, { ok: false, name, reason: 'file missing' });
      continue;
    }
    if (!MIME[ext]) {
      result.set(p, { ok: false, name, size: stat.size, reason: `extension ${ext} not accepted` });
    } else if (stat.size > MAX_BYTES) {
      result.set(p, { ok: false, name, size: stat.size, reason: `larger than 20 MB (${stat.size} bytes)` });
    } else if (hash && !known.has(name)) {
      const actual = sha1(fs.readFileSync(file));
      hashed++;
      if (hashed % 1000 === 0) log(`  hashed ${hashed} images`);
      result.set(p, actual === sha ? { ok: true, name, size: stat.size } : { ok: false, name, size: stat.size, reason: `sha1 is ${actual}` });
    } else {
      result.set(p, { ok: true, name, size: stat.size });
    }
  }
  return result;
}

const CHECK_CHUNK = 10000; // MAX_MEDIA_CHECK_FILES of the API

/**
 * Names among `names` that the server already stores (POST /media/check, 10,000 per
 * request; a chunk the API refuses as too large is split).
 */
async function checkImages({ api, names, concurrency = 1, shouldStop = () => false }) {
  const existing = new Set();
  const queue = chunk(names, CHECK_CHUNK);
  await runPool({
    size: concurrency,
    next: () => (queue.length ? queue.shift() : null),
    shouldStop,
    worker: async (group) => {
      let res;
      try {
        res = await api.request('POST', '/admin/import/media/check', { json: { files: group } });
      } catch (error) {
        if (group.length > 1 && (error.status === 400 || error.status === 413)) {
          const half = Math.ceil(group.length / 2);
          queue.unshift(group.slice(0, half), group.slice(half));
          return;
        }
        throw error;
      }
      for (const name of (res.data && res.data.existing) || []) existing.add(name);
    },
  });
  return existing;
}

/**
 * Uploads `items` ([{ name, path }]) with `concurrency` parallel requests. A 4xx other
 * than 401/403/429 fails that image only (reported, returned in `failed`); anything
 * else still failing after the retries stops the run. Returns { uploaded, bytes, failed }.
 */
async function uploadImages({ api, datasetDir, items, state, report, concurrency, shouldStop, progress, phase = 'media' }) {
  const failed = new Set();
  let uploaded = 0;
  let bytes = 0;
  await runPool({
    size: concurrency,
    next: fromList(items),
    shouldStop,
    worker: async (item) => {
      const [sha, ext] = item.name.split('.');
      let buffer;
      try {
        buffer = await fs.promises.readFile(path.join(datasetDir, item.path));
      } catch (error) {
        failed.add(item.name);
        report.failure(phase, item.name, `cannot read: ${error.message}`);
        if (progress) progress.add();
        return;
      }
      try {
        const res = await api.request('POST', '/admin/import/media', {
          lane: 'images',
          bytes: buffer.length,
          timeoutMs: Math.max(api.timeoutMs || 0, 300000),
          form: () => {
            const form = new FormData();
            form.append('sha1', sha);
            form.append('file', new Blob([buffer], { type: MIME[ext] }), item.name);
            return form;
          },
        });
        const url = (res.data && res.data.url) || imageUrlForName(item.name);
        if (url !== imageUrlForName(item.name)) report.warning(phase, item.name, `server url ${url} differs from ${imageUrlForName(item.name)}`);
        state.put('image', item.name, { url, existed: Boolean(res.data && res.data.existed) });
        state.flush();
        uploaded++;
        bytes += buffer.length;
      } catch (error) {
        if (!error.status || error.status >= 500 || error.status === 429 || error.status === 401 || error.status === 403) throw error;
        failed.add(item.name);
        report.failure(phase, item.name, error.message);
      }
      if (progress) progress.add();
    },
  });
  return { uploaded, bytes, failed };
}

/**
 * Makes sure every image in `items` ([{ name, path, size }]) is on the server:
 * names already acknowledged in the state are skipped, the rest are checked in bulk
 * and the missing ones uploaded, `concurrency` at a time. Returns the set of names
 * that failed.
 */
async function syncImages({ api, datasetDir, items, state, report, log, shouldStop, concurrency = 1, progress = null }) {
  const counts = report.phase('media');
  counts.referenced = items.length;
  const todo = items.filter((item) => !state.acknowledged('image', item.name));
  counts.alreadyUploaded = items.length - todo.length;

  const existing = todo.length ? await checkImages({ api, names: todo.map((i) => i.name), shouldStop }) : new Set();
  const missing = [];
  for (const item of todo) {
    if (existing.has(item.name)) {
      state.put('image', item.name, { url: imageUrlForName(item.name), existed: true });
      counts.existing = (counts.existing || 0) + 1;
    } else {
      missing.push(item);
    }
  }
  state.flush();
  log(`  ${counts.alreadyUploaded} known from state, ${counts.existing || 0} already on the server, ${missing.length} to upload`);
  if (shouldStop()) return new Set();

  if (progress) progress.begin('media', missing.length, 'uploads');
  const result = await uploadImages({ api, datasetDir, items: missing, state, report, concurrency, shouldStop, progress });
  if (progress) progress.end();
  state.flush();
  counts.uploaded = result.uploaded;
  counts.failed = result.failed.size;
  counts.uploadedBytes = result.bytes;
  return result.failed;
}

module.exports = { verifyImages, syncImages, checkImages, uploadImages, imageName, imageUrlForName, MIME, MAX_BYTES, URL_PREFIX };
