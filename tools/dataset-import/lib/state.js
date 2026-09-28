'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resume state, one JSON object per line, last line per key wins:
 *   {"type":"question","key":"q_…","hash":"…","id":12}
 *   {"type":"image","key":"<sha1>.<ext>","url":"/api/v1/media/images/…"}
 *   {"type":"exam","key":"exam:…","hash":"…","id":3}
 *   {"type":"hierarchy","key":"hierarchy","hash":"…"}
 * The verify phase writes what it finds on the server: a question or exam missing
 * there gets "hash":null (so the next run sends it again), an image missing there
 * gets "missing":true.
 * A missing file just means nothing is known yet.
 *
 * One writer: the importer holds <file>.lock while it runs (a second import on the
 * same file is refused), requests only change the in-memory map, and flush() appends
 * every pending line with a single synchronous write, so lines never interleave. A
 * line torn by a crash is ignored on the next load (that item is sent again).
 */
class StateStore {
  constructor(file, { readOnly = false } = {}) {
    this.file = file;
    this.readOnly = readOnly;
    this.entries = new Map();
    this.lines = 0;
    this.pending = [];
    this.loaded = false;
    this.lockFile = null;
    this.releaseOnExit = null;
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

  /**
   * Takes <file>.lock, or throws when another live process holds it. A lock left by a
   * process that no longer runs (same host) is taken over.
   */
  lock() {
    if (this.readOnly || !this.file || this.lockFile) return this;
    const lockFile = `${this.file}.lock`;
    fs.mkdirSync(path.dirname(path.resolve(lockFile)), { recursive: true });
    const mine = JSON.stringify({ pid: process.pid, host: os.hostname(), since: new Date().toISOString() });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.writeFileSync(lockFile, mine, { flag: 'wx' });
        this.lockFile = lockFile;
        this.releaseOnExit = () => this.unlock();
        process.on('exit', this.releaseOnExit);
        return this;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      } catch {
        holder = null; // half-written or unreadable: treat as stale
      }
      if (holder && holder.host === os.hostname() && isAlive(holder.pid)) {
        throw new Error(`the state file ${this.file} is in use by another import (pid ${holder.pid} since ${holder.since}); wait for it or stop it (delete ${lockFile} only if no import runs)`);
      }
      if (holder && holder.host !== os.hostname()) {
        throw new Error(`the state file ${this.file} is locked by host ${holder.host} (pid ${holder.pid}); delete ${lockFile} if no import runs there`);
      }
      try {
        fs.unlinkSync(lockFile);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`could not lock ${lockFile}`);
  }

  unlock() {
    if (!this.lockFile) return;
    try {
      const holder = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
      if (holder.pid === process.pid) fs.unlinkSync(this.lockFile);
    } catch {
      // already gone
    }
    if (this.releaseOnExit) process.removeListener('exit', this.releaseOnExit);
    this.lockFile = null;
    this.releaseOnExit = null;
  }

  get(type, key) {
    return this.entries.get(`${type} ${key}`);
  }

  has(type, key) {
    return this.entries.has(`${type} ${key}`);
  }

  /** Known to be on the server (an image the verify phase found missing is not) */
  acknowledged(type, key) {
    const entry = this.get(type, key);
    return Boolean(entry && !entry.missing);
  }

  put(type, key, value) {
    const entry = { type, key, ...value };
    this.entries.set(`${type} ${key}`, entry);
    this.pending.push(JSON.stringify(entry));
  }

  /** put() unless the stored entry already has exactly these fields */
  putIfChanged(type, key, value) {
    const current = this.get(type, key);
    if (current) {
      const keys = new Set([...Object.keys(current), ...Object.keys(value), 'type', 'key']);
      keys.delete('type');
      keys.delete('key');
      let same = true;
      for (const k of keys) if (JSON.stringify(current[k]) !== JSON.stringify(value[k])) same = false;
      if (same) return false;
    }
    this.put(type, key, value);
    return true;
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

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

module.exports = { StateStore };
