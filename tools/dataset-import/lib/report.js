'use strict';

const fs = require('fs');
const path = require('path');

// Caps keep a pathological run from filling the disk; counts are always exact
const MAX_FAILURES = 200000;
const MAX_WARNINGS = 20000;

/** Counts per phase/action plus every failure and warning, written as one JSON file. */
class Report {
  constructor(options) {
    this.data = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      options,
      phases: {},
      failures: [],
      failureCount: 0,
      warnings: [],
      warningCount: 0,
    };
  }

  phase(name) {
    if (!this.data.phases[name]) this.data.phases[name] = {};
    return this.data.phases[name];
  }

  failure(phase, key, error) {
    this.data.failureCount++;
    if (this.data.failures.length < MAX_FAILURES) this.data.failures.push({ phase, key, error: String(error) });
  }

  warning(phase, key, warning) {
    this.data.warningCount++;
    if (this.data.warnings.length < MAX_WARNINGS) this.data.warnings.push({ phase, key, warning: String(warning) });
  }

  set(key, value) {
    this.data[key] = value;
  }

  write(file, exitCode) {
    this.data.finishedAt = new Date().toISOString();
    this.data.exitCode = exitCode;
    if (this.data.failureCount > this.data.failures.length) this.data.failuresTruncated = true;
    if (this.data.warningCount > this.data.warnings.length) this.data.warningsTruncated = true;
    if (!file) return;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(this.data, null, 2) + '\n');
  }
}

module.exports = { Report };
