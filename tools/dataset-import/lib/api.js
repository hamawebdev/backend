'use strict';

const { sleep } = require('./util');

class ApiError extends Error {
  constructor(message, { status, body, retryable = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

function unwrap(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'success' in body && 'data' in body) return body.data;
  return body;
}

function errorMessage(status, body, text) {
  if (body && typeof body === 'object') {
    const err = body.error;
    const msg = (err && typeof err === 'object' ? err.message : err) || body.message;
    const details = err && typeof err === 'object' && err.details ? ` ${JSON.stringify(err.details).slice(0, 500)}` : '';
    if (msg) return `HTTP ${status}: ${msg}${details}`;
  }
  return `HTTP ${status}: ${String(text || '').slice(0, 300)}`;
}

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// 408, 429 and 5xx mean "try again later"; every other status is the answer
function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

// Retry-After is seconds or an HTTP date; null when absent or unreadable
function retryAfterMs(res) {
  const value = res && res.headers && res.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * Exponential backoff with jitter: attempt 1 waits between base/2 and base, attempt 2
 * between base and 2*base, ... never more than cap.
 */
function backoffDelay(attempt, baseMs, capMs, random = Math.random) {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/**
 * A concurrency gate. `limit` moves between 1 and `max` (the client lowers it while
 * the server is in trouble and raises it back after successes); requests over the
 * limit wait in arrival order.
 */
class Lane {
  constructor(name, max) {
    this.name = name;
    this.max = Math.max(1, max);
    this.limit = this.max;
    this.lowest = this.max;
    this.active = 0;
    this.peak = 0;
    this.successes = 0;
    this.waiting = [];
  }

  acquire() {
    if (this.active < this.limit) {
      this.active++;
      this.peak = Math.max(this.peak, this.active);
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release() {
    this.active--;
    this.drain();
  }

  drain() {
    while (this.waiting.length && this.active < this.limit) {
      this.active++;
      this.peak = Math.max(this.peak, this.active);
      this.waiting.shift()();
    }
  }

  setLimit(n) {
    this.limit = Math.max(1, Math.min(this.max, n));
    this.lowest = Math.min(this.lowest, this.limit);
    this.drain();
  }
}

/**
 * Concurrent client for the MedADN import API.
 * - requests run in parallel, at most `concurrency` at once (image uploads: their own
 *   lane of `imageConcurrency`), optionally at least `minDelayMs` apart
 * - 408/429/5xx, network errors and timeouts are retried with the same payload (every
 *   endpoint is idempotent) after an exponential backoff with jitter, up to `retries`
 *   times; a 429 with Retry-After also pauses every new request that long
 * - while such errors keep happening (or answers take longer than `slowMs`) the
 *   concurrency of every lane is halved, at most once per `reduceIntervalMs`, down to 1;
 *   after `recoverAfterMs` without trouble each lane gains one slot per 2*limit successes
 * - latency alone never delays anything
 * - one login; the access token is refreshed before it expires and on a 401. Only one
 *   login/refresh runs at a time and every request waits for it (logins are
 *   single-device and refresh tokens rotate, so parallel refreshes would log out)
 */
class ApiClient {
  constructor(options) {
    const opt = (name, fallback) => (options[name] !== undefined ? options[name] : fallback);
    this.baseUrl = String(options.baseUrl).replace(/\/+$/, '');
    this.email = options.email;
    this.password = options.password;
    this.minDelayMs = opt('minDelayMs', 0);
    this.maxDelayMs = opt('maxDelayMs', 60000);
    this.backoffMs = opt('backoffMs', 1000);
    this.slowMs = opt('slowMs', 30000);
    this.retries = opt('retries', 8);
    this.timeoutMs = opt('timeoutMs', 180000);
    this.reduceIntervalMs = opt('reduceIntervalMs', 1000);
    this.recoverAfterMs = opt('recoverAfterMs', 5000);
    this.random = options.random || Math.random;
    this.log = options.log || (() => {});
    this.fetch = options.fetch || globalThis.fetch;
    this.deviceFingerprint = options.deviceFingerprint || 'medadn-dataset-import';
    this.lanes = {
      default: new Lane('requests', opt('concurrency', 4)),
      images: new Lane('uploads', opt('imageConcurrency', 8)),
    };
    this.nextStartAt = 0;
    this.pausedUntil = 0;
    this.lastReduction = 0;
    this.lastTrouble = 0;
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.refreshMarginMs = 0;
    this.authPromise = null;
    // `slow` counts backoff events (kept under that name for older reports)
    this.stats = { requests: 0, retries: 0, errors: 0, slow: 0, slowAnswers: 0, throttles: 0, recoveries: 0, refreshes: 0, logins: 0, maxDelayMs: 0, concurrency: {} };
    this.updateConcurrencyStats();
  }

  updateConcurrencyStats() {
    for (const lane of Object.values(this.lanes)) {
      this.stats.concurrency[lane.name] = { max: lane.max, current: lane.limit, lowest: lane.lowest, peakInFlight: lane.peak };
    }
  }

  /** "requests 4/4, uploads 8/8" (current limit / configured) */
  describeConcurrency() {
    return Object.values(this.lanes).map((l) => `${l.name} ${l.limit}/${l.max}`).join(', ');
  }

  // Server trouble: halve every lane (at most once per reduceIntervalMs)
  pressure(reason) {
    const now = Date.now();
    this.lastTrouble = now;
    for (const lane of Object.values(this.lanes)) lane.successes = 0;
    if (now - this.lastReduction < this.reduceIntervalMs) return;
    let changed = false;
    for (const lane of Object.values(this.lanes)) {
      if (lane.limit > 1) {
        lane.setLimit(Math.floor(lane.limit / 2));
        changed = true;
      }
    }
    if (!changed) return;
    this.lastReduction = now;
    this.stats.throttles++;
    this.updateConcurrencyStats();
    this.log(`  concurrency reduced to ${this.describeConcurrency()} (${reason})`);
  }

  // A good answer: after a quiet period, grow the lane back one slot at a time
  relief(lane) {
    if (lane.limit >= lane.max) return;
    lane.successes++;
    if (lane.successes >= lane.limit * 2 && Date.now() - this.lastTrouble >= this.recoverAfterMs) {
      lane.successes = 0;
      lane.setLimit(lane.limit + 1);
      this.stats.recoveries++;
      this.updateConcurrencyStats();
      this.log(`  concurrency back to ${this.describeConcurrency()}`);
    }
  }

  async waitForTurn() {
    for (let wait = this.pausedUntil - Date.now(); wait > 0; wait = this.pausedUntil - Date.now()) await sleep(wait);
    if (this.minDelayMs > 0) {
      const at = Math.max(Date.now(), this.nextStartAt);
      this.nextStartAt = at + this.minDelayMs;
      if (at > Date.now()) await sleep(at - Date.now());
    }
  }

  /**
   * One API call with retries. options: json | form (a function returning a fresh
   * FormData per attempt), lane ('default' | 'images'), bytes (payload size, for the
   * slow threshold), timeoutMs, auth (false for login/refresh).
   */
  async request(method, path, options = {}) {
    const auth = options.auth !== false;
    const lane = auth ? this.lanes[options.lane] || this.lanes.default : null;
    let failures = 0;
    let reauths = 0;
    for (;;) {
      if (auth) await this.ensureToken();
      if (lane) await lane.acquire();
      await this.waitForTurn();
      if (auth && this.authPromise) {
        // a refresh started while this request waited for its slot: use the new token
        lane.release();
        continue;
      }
      const token = this.accessToken;
      let outcome;
      try {
        outcome = await this.attempt(method, path, options, auth ? token : null);
      } finally {
        if (lane) lane.release();
      }
      this.stats.requests++;
      const { res, status, body, text, latency, networkError } = outcome;

      if (networkError || retryableStatus(status)) {
        const reason = networkError ? networkError.message : `HTTP ${status}`;
        failures++;
        this.stats.errors++;
        this.stats.slow++;
        this.pressure(`${method} ${path}: ${reason}`);
        if (failures > this.retries) {
          throw new ApiError(`${method} ${path} failed after ${this.retries} retries: ${networkError ? reason : errorMessage(status, body, text)}`, { status, body, retryable: true });
        }
        this.stats.retries++;
        let wait = backoffDelay(failures, this.backoffMs, this.maxDelayMs, this.random);
        if (status === 429) {
          const asked = retryAfterMs(res);
          if (asked !== null) wait = Math.max(wait, Math.min(asked, this.maxDelayMs));
          // the server asked everyone to slow down, not just this request
          this.pausedUntil = Math.max(this.pausedUntil, Date.now() + wait);
        }
        this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs, wait);
        this.log(`  ${method} ${path}: ${reason}, retry ${failures}/${this.retries} in ${(wait / 1000).toFixed(1)} s`);
        await sleep(wait);
        continue;
      }

      if (status >= 200 && status < 300) {
        const threshold = this.slowMs + (options.bytes ? options.bytes / 200 : 0);
        if (latency > threshold) {
          this.stats.slowAnswers++;
          this.pressure(`${method} ${path} took ${latency} ms`);
        } else if (lane) {
          this.relief(lane);
        }
      }

      if (status === 401 && auth && reauths < 2) {
        reauths++;
        await this.refreshShared(token);
        continue;
      }
      if (status < 200 || status >= 300) {
        throw new ApiError(`${method} ${path}: ${errorMessage(status, body, text)}`, { status, body });
      }
      if (lane) this.updateConcurrencyStats();
      return { status, data: unwrap(body), latency };
    }
  }

  // One HTTP exchange; never throws
  async attempt(method, path, options, token) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    let res;
    let text;
    let networkError;
    try {
      const headers = { accept: 'application/json' };
      let body;
      if (options.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.json);
      } else if (options.form) {
        body = options.form();
      }
      if (token) headers.authorization = `Bearer ${token}`;
      res = await this.fetch(this.baseUrl + path, { method, headers, body, signal: controller.signal });
      text = await res.text();
    } catch (error) {
      const cause = error && error.cause ? ` (${error.cause.code || error.cause.message})` : '';
      networkError = error && error.name === 'AbortError' ? new Error('request timed out') : new Error(`${error && error.message}${cause}`);
    } finally {
      clearTimeout(timer);
    }
    let body;
    if (text !== undefined) {
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
    }
    return { res, status: res && !networkError ? res.status : 0, body, text, latency: Date.now() - started, networkError };
  }

  setTokens(data) {
    const tokens = data && (data.tokens || data);
    if (!tokens || !tokens.accessToken) throw new ApiError('login response has no data.tokens.accessToken');
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken || this.refreshToken;
    this.expiresAt = tokenExpiry(this.accessToken);
    // Refresh a minute before expiry, or a quarter of the lifetime for short-lived tokens
    this.refreshMarginMs = this.expiresAt ? Math.min(60000, Math.max(0, (this.expiresAt - Date.now()) / 4)) : 0;
  }

  // Runs fn as the only login/refresh in flight; callers arriving meanwhile share it
  shared(fn) {
    if (!this.authPromise) {
      this.authPromise = (async () => {
        try {
          await fn();
        } finally {
          this.authPromise = null;
        }
      })();
    }
    return this.authPromise;
  }

  login() {
    return this.shared(() => this.loginNow());
  }

  async loginNow() {
    if (!this.email || !this.password) throw new ApiError('IMPORT_EMAIL and IMPORT_PASSWORD must be set');
    this.stats.logins++;
    let res;
    try {
      res = await this.request('POST', '/auth/login', {
        auth: false,
        json: { email: this.email, password: this.password, deviceFingerprint: this.deviceFingerprint },
      });
    } catch (error) {
      throw new ApiError(`login failed: ${error.message}`, { status: error.status });
    }
    this.setTokens(res.data);
  }

  async refreshNow() {
    this.stats.refreshes++;
    const res = await this.request('POST', '/auth/refresh', { auth: false, json: { refreshToken: this.refreshToken } });
    this.setTokens(res.data);
  }

  async reauthenticate() {
    if (this.refreshToken) {
      try {
        await this.refreshNow();
        return;
      } catch (error) {
        if (error.retryable) throw error;
        this.log('  token refresh refused, logging in again');
      }
    }
    await this.loginNow();
  }

  /**
   * Refreshes the token that `staleToken` was, once: when another request already
   * replaced it (or is replacing it), this only waits for that.
   */
  refreshShared(staleToken) {
    if (this.authPromise) return this.authPromise;
    if (staleToken !== undefined && this.accessToken !== staleToken) return Promise.resolve();
    return this.shared(() => this.reauthenticate());
  }

  async ensureToken() {
    if (this.authPromise) await this.authPromise;
    if (!this.accessToken) return this.login();
    if (this.expiresAt && this.expiresAt - Date.now() < this.refreshMarginMs) return this.refreshShared(this.accessToken);
    return undefined;
  }
}

module.exports = { ApiClient, ApiError, Lane, unwrap, tokenExpiry, backoffDelay, retryableStatus, retryAfterMs };
