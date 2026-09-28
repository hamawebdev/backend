#!/usr/bin/env node
'use strict';

// MedADN dataset importer: pushes /srv/medadn/dataset to the import API.
// Usage and options: see README.md in this folder, or run with --help.

const { run, PHASES } = require('./lib/run');

const HELP = `Usage: node import.js --dataset <dir> [--api <url>] (--sample | --full) [options]

  --dataset <dir>        dataset folder (holds index.json and images/)
  --api <url>            API base, e.g. https://api.med-adn.com/api/v1 (not needed with --dry-run)
  --sample               import a small set covering every kind of data
  --full                 import everything
  --dry-run              no request at all: print the plan and the totals
  --state <file>         resume state (JSON lines), default ./import-state.jsonl
  --report <file>        JSON report, default ./import-report-<time>.json
  --batch <n>            questions per request, 1-200 (default 200)
  --min-delay-ms <n>     minimum pause between requests (default 1500)
  --max-delay-ms <n>     cap of the adaptive pause (default 60000)
  --slow-ms <n>          a request slower than this backs off (default 4000)
  --retries <n>          retries per request on 429/5xx/network errors (default 8)
  --phases <list>        comma list among ${PHASES.join(',')} (default all)
  --force                send every question and exam even if the state says unchanged
  --update-hierarchy     let the API rename existing universities/modules/courses (updateExisting)
  --skip-image-hash      do not re-hash image files (existence and size are still checked)
  --ignore-errors        import even if the dataset has validation errors
  --print-modules        print the canonical module table
  --help

Credentials come from IMPORT_EMAIL and IMPORT_PASSWORD.
Exit codes: 0 ok, 1 fatal, 2 some items failed, 3 reconciliation mismatch, 130 interrupted.`;

const VALUE_FLAGS = new Set(['dataset', 'api', 'state', 'report', 'batch', 'min-delay-ms', 'max-delay-ms', 'slow-ms', 'retries', 'phases']);
const BOOL_FLAGS = new Set(['sample', 'full', 'dry-run', 'force', 'update-hierarchy', 'skip-image-hash', 'ignore-errors', 'print-modules', 'help']);

function parseArgs(argv) {
  const raw = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument ${arg}`);
    let [name, value] = arg.slice(2).split(/=(.*)/s);
    if (BOOL_FLAGS.has(name)) {
      raw[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      if (value === undefined) value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
      raw[name] = value;
    } else {
      throw new Error(`unknown option --${name}`);
    }
  }
  return raw;
}

function intOption(raw, name, fallback, min, max) {
  if (raw[name] === undefined) return fallback;
  const n = Number(raw[name]);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  return n;
}

function buildOptions(raw, env) {
  if (!raw.dataset) throw new Error('--dataset is required');
  if (raw.sample && raw.full) throw new Error('choose one of --sample and --full');
  if (!raw.sample && !raw.full && !raw['dry-run']) throw new Error('choose --sample or --full (or --dry-run)');
  if (!raw['dry-run'] && !raw.api) throw new Error('--api is required');
  const phases = raw.phases ? raw.phases.split(',').map((p) => p.trim()).filter(Boolean) : null;
  if (phases) for (const p of phases) if (!PHASES.includes(p)) throw new Error(`unknown phase ${p}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const options = {
    dataset: raw.dataset,
    api: raw.api,
    mode: raw.sample ? 'sample' : 'full',
    dryRun: Boolean(raw['dry-run']),
    state: raw.state || 'import-state.jsonl',
    report: raw.report || `import-report-${stamp}.json`,
    batch: intOption(raw, 'batch', 200, 1, 200),
    minDelayMs: intOption(raw, 'min-delay-ms', 1500, 0, 600000),
    maxDelayMs: intOption(raw, 'max-delay-ms', 60000, 0, 3600000),
    slowMs: intOption(raw, 'slow-ms', 4000, 1, 3600000),
    retries: intOption(raw, 'retries', 8, 0, 100),
    phases,
    force: Boolean(raw.force),
    updateHierarchy: Boolean(raw['update-hierarchy']),
    skipImageHash: Boolean(raw['skip-image-hash']),
    ignoreErrors: Boolean(raw['ignore-errors']),
    printModules: Boolean(raw['print-modules']),
    email: env.IMPORT_EMAIL,
    password: env.IMPORT_PASSWORD,
  };
  if (options.maxDelayMs < options.minDelayMs) options.maxDelayMs = options.minDelayMs;
  if (!options.dryRun && (!options.email || !options.password)) throw new Error('set IMPORT_EMAIL and IMPORT_PASSWORD');
  return options;
}

async function main() {
  let options;
  try {
    const raw = parseArgs(process.argv.slice(2));
    if (raw.help) {
      console.log(HELP);
      return 0;
    }
    options = buildOptions(raw, process.env);
  } catch (error) {
    console.error(`${error.message}\n\n${HELP}`);
    return 1;
  }
  return run(options);
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { parseArgs, buildOptions };
