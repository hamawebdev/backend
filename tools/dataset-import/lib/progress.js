'use strict';

const { formatDuration } = require('./util');

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/**
 * Progress of the running phase, printed every `intervalMs` (0: only at the end of
 * each phase): done/total, rate, ETA, current concurrency, retries and requests so far.
 */
class Progress {
  constructor({ log, intervalMs = 30000, api = null, now = () => Date.now() }) {
    this.log = log;
    this.intervalMs = intervalMs;
    this.api = api;
    this.now = now;
    this.current = null;
    this.timer = null;
  }

  start() {
    if (this.intervalMs > 0 && !this.timer) {
      this.timer = setInterval(() => {
        if (this.current) this.log(this.line());
      }, this.intervalMs);
      if (this.timer.unref) this.timer.unref();
    }
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  begin(phase, total, unit = 'items') {
    this.current = { phase, total, unit, done: 0, started: this.now() };
    return this.current;
  }

  add(n = 1) {
    if (this.current) this.current.done += n;
  }

  // Extends the total (repairs, split batches)
  grow(n) {
    if (this.current) this.current.total += n;
  }

  end() {
    if (!this.current) return;
    this.log(this.line());
    this.current = null;
  }

  line() {
    const c = this.current;
    const elapsed = Math.max(1, this.now() - c.started);
    const rate = (c.done * 1000) / elapsed;
    const left = Math.max(0, c.total - c.done);
    const eta = left === 0 ? 'done' : rate > 0 ? `ETA ${formatDuration((left / rate) * 1000)}` : 'ETA ?';
    const parts = [`[progress] ${c.phase} ${fmt(c.done)}/${fmt(c.total)} ${c.unit}`, `${rate.toFixed(1)}/s`, `${formatDuration(elapsed)} elapsed`, eta];
    let line = parts.join(', ');
    if (this.api) line += ` | concurrency ${this.api.describeConcurrency()} | retries ${fmt(this.api.stats.retries)} | requests ${fmt(this.api.stats.requests)}`;
    return line;
  }
}

module.exports = { Progress };
