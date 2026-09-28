'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resume state, one JSON object per line, last line per key wins:
 *   {"type":"question","key":"q_…","hash":"…","id":12}
 *   {"type":"image","key":"<sha1>.<ext>","url":"/api/v1/media/images/…"}
 *   {"type":"exam","key":"exam:…","hash":"…","id":3}
 * A missing file just means nothing is known yet.
 */
class StateStore {
  constructor(file, { readOnly = false } = {}) {
    this.file = file;
    this.readOnly = readOnly;
    this.entries = new Map();
    this.lines = 0;
    this.pending = [];
    this.loaded = false;
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return this;
    const text = fs.readFileSync(this.file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && entry.type && entry.key) {
          this.entries.set(`${entry.type} ${entry.key}`, entry);
          this.lines++;
        }
      } catch {
        // a torn last line after a crash: ignore it, the item is simply sent again
      }
    }
    this.loaded = true;
    return this;
  }

  get(type, key) {
    return this.entries.get(`${type} ${key}`);
  }

  has(type, key) {
    return this.entries.has(`${type} ${key}`);
  }

  put(type, key, value) {
    const entry = { type, key, ...value };
    this.entries.set(`${type} ${key}`, entry);
    this.pending.push(JSON.stringify(entry));
  }

  count(type) {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.type === type) n++;
    return n;
  }

  flush() {
    if (this.readOnly || !this.file || !this.pending.length) {
      if (this.readOnly) this.pending = [];
      return;
    }
    fs.mkdirSync(path.dirname(path.resolve(this.file)), { recursive: true });
    fs.appendFileSync(this.file, this.pending.join('\n') + '\n');
    this.lines += this.pending.length;
    this.pending = [];
  }

  // Rewrites the file with one line per key when superseded lines pile up
  compact() {
    if (this.readOnly || !this.file || this.lines <= this.entries.size * 2 + 1000) return false;
    this.flush();
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, [...this.entries.values()].map((e) => JSON.stringify(e)).join('\n') + '\n');
    fs.renameSync(tmp, this.file);
    this.lines = this.entries.size;
    return true;
  }
}

module.exports = { StateStore };
