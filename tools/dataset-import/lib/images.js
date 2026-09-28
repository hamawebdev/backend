'use strict';

const fs = require('fs');
const path = require('path');
const { sha1, chunk } = require('./util');

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

/**
 * Makes sure every image in `items` ([{ name, path, size }]) is on the server:
 * names already acknowledged in the state are skipped, the rest are checked in bulk
 * and the missing ones uploaded one by one. Returns the set of names that failed.
 */
async function syncImages({ api, datasetDir, items, state, report, log, shouldStop }) {
  const failed = new Set();
  const counts = report.phase('media');
  counts.referenced = items.length;
  const todo = items.filter((item) => !state.has('image', item.name));
  counts.alreadyUploaded = items.length - todo.length;

  const missing = [];
  for (const group of chunk(todo, 500)) {
    if (shouldStop()) break;
    const res = await api.request('POST', '/admin/import/media/check', { json: { files: group.map((i) => i.name) } });
    const existing = new Set((res.data && res.data.existing) || []);
    for (const item of group) {
      if (existing.has(item.name)) {
        state.put('image', item.name, { url: imageUrlForName(item.name), existed: true });
        counts.existing = (counts.existing || 0) + 1;
      } else {
        missing.push(item);
      }
    }
    state.flush();
  }
  log(`  ${counts.alreadyUploaded} known from state, ${counts.existing || 0} already on the server, ${missing.length} to upload`);

  let uploaded = 0;
  let bytes = 0;
  for (const item of missing) {
    if (shouldStop()) break;
    const [sha, ext] = item.name.split('.');
    let buffer;
    try {
      buffer = fs.readFileSync(path.join(datasetDir, item.path));
    } catch (error) {
      failed.add(item.name);
      report.failure('media', item.name, `cannot read: ${error.message}`);
      continue;
    }
    try {
      const res = await api.request('POST', '/admin/import/media', {
        bytes: buffer.length,
        timeoutMs: 300000,
        form: () => {
          const form = new FormData();
          form.append('sha1', sha);
          form.append('file', new Blob([buffer], { type: MIME[ext] }), item.name);
          return form;
        },
      });
      const url = (res.data && res.data.url) || imageUrlForName(item.name);
      if (url !== imageUrlForName(item.name)) report.warning('media', item.name, `server url ${url} differs from ${imageUrlForName(item.name)}`);
      state.put('image', item.name, { url, existed: Boolean(res.data && res.data.existed) });
      uploaded++;
      bytes += buffer.length;
      counts.uploaded = uploaded;
      if (uploaded % 20 === 0) state.flush();
      if (uploaded % 100 === 0) log(`  uploaded ${uploaded}/${missing.length} images (${(bytes / 1048576).toFixed(0)} MB)`);
    } catch (error) {
      if (!error.status || error.status >= 500 || error.status === 429 || error.status === 401 || error.status === 403) throw error;
      failed.add(item.name);
      report.failure('media', item.name, error.message);
    }
  }
  state.flush();
  counts.failed = failed.size;
  counts.uploadedBytes = bytes;
  return failed;
}

module.exports = { verifyImages, syncImages, imageName, imageUrlForName, MIME, MAX_BYTES, URL_PREFIX };
