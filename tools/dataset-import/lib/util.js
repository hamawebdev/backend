'use strict';

const crypto = require('crypto');

// JSON with object keys sorted at every level and undefined values dropped, so the
// same payload always serialises to the same string (used for contentHash).
function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v === undefined ? null : v)).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

// Removes keys whose value is undefined or null (the import contract marks them optional)
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(s % 60).padStart(2, '0')}s`;
}

module.exports = { canonicalJson, sha256, sha1, compact, sleep, chunk, formatDuration };
