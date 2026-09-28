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

/**
 * Sequential, paced client for the MedADN import API.
 * - one request at a time, at least `delay` ms between the end of one and the start of the next
 * - the delay doubles (up to maxDelayMs) on a slow answer, a 429, a 5xx or a network error,
 *   and shrinks by 10% per fast answer back towards minDelayMs
 * - 429/5xx/network errors are retried with the same payload (the API is idempotent)
 * - one login; the access token is refreshed before it expires and on a 401
 */
class ApiClient {
  constructor(options) {
    this.baseUrl = String(options.baseUrl).replace(/\/+$/, '');
    this.email = options.email;
    this.password = options.password;
    this.minDelayMs = options.minDelayMs !== undefined ? options.minDelayMs : 1500;
    this.maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : 60000;
    this.slowMs = options.slowMs !== undefined ? options.slowMs : 4000;
    this.retries = options.retries !== undefined ? options.retries : 8;
    this.timeoutMs = options.timeoutMs || 180000;
    this.log = options.log || (() => {});
    this.fetch = options.fetch || globalThis.fetch;
    this.deviceFingerprint = options.deviceFingerprint || 'medadn-dataset-import';
    this.delay = this.minDelayMs;
    this.lastEnd = 0;
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.busy = Promise.resolve();
    this.stats = { requests: 0, retries: 0, slow: 0, refreshes: 0, logins: 0, maxDelayMs: this.delay };
  }

  slower(reason) {
    const next = Math.min(this.maxDelayMs, Math.max(this.delay * 2, 1000, this.minDelayMs));
    if (next !== this.delay) this.log(`  backing off (${reason}): ${this.delay} ms -> ${next} ms between requests`);
    this.delay = next;
    this.stats.slow++;
    this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs, this.delay);
  }

  faster() {
    if (this.delay > this.minDelayMs) this.delay = Math.max(this.minDelayMs, Math.floor(this.delay * 0.9));
  }

  // Serialises every call, even if a caller forgets to await
  request(method, path, options = {}) {
    const run = this.busy.then(() => this.send(method, path, options));
    this.busy = run.catch(() => {});
    return run;
  }

  async send(method, path, options) {
    const auth = options.auth !== false;
    let failures = 0;
    let reauthed = false;
    for (;;) {
      if (auth) await this.ensureToken();
      const wait = this.lastEnd + this.delay - Date.now();
      if (wait > 0) await sleep(wait);

      const started = Date.now();
      let res;
      let text;
      let networkError;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
      try {
        const headers = { accept: 'application/json' };
        let body;
        if (options.json !== undefined) {
          headers['content-type'] = 'application/json';
          body = JSON.stringify(options.json);
        } else if (options.form) {
          body = options.form();
        }
        if (auth) headers.authorization = `Bearer ${this.accessToken}`;
        res = await this.fetch(this.baseUrl + path, { method, headers, body, signal: controller.signal });
        text = await res.text();
      } catch (error) {
        const cause = error.cause ? ` (${error.cause.code || error.cause.message})` : '';
        networkError = error.name === 'AbortError' ? new Error('request timed out') : new Error(`${error.message}${cause}`);
      } finally {
        clearTimeout(timer);
      }
      const latency = Date.now() - started;
      this.lastEnd = Date.now();
      this.stats.requests++;

      let body;
      if (text !== undefined) {
        try {
          body = text ? JSON.parse(text) : undefined;
        } catch {
          body = undefined;
        }
      }

      const status = res ? res.status : 0;
      if (networkError || status === 429 || status >= 500) {
        const reason = networkError ? networkError.message : `HTTP ${status}`;
        this.slower(reason);
        failures++;
        this.stats.retries++;
        if (failures > this.retries) {
          throw new ApiError(`${method} ${path} failed after ${this.retries} retries: ${networkError ? reason : errorMessage(status, body, text)}`, { status, body, retryable: true });
        }
        if (status === 429) {
          const retryAfter = Number(res.headers.get('retry-after'));
          if (retryAfter > 0) this.lastEnd = Date.now() + Math.min(retryAfter * 1000, this.maxDelayMs) - this.delay;
        }
        this.log(`  ${method} ${path}: ${reason}, retry ${failures}/${this.retries} in ${Math.round(this.delay / 100) / 10} s`);
        continue;
      }

      const threshold = this.slowMs + (options.bytes ? options.bytes / 200 : 0);
      if (latency > threshold) this.slower(`${method} ${path} took ${latency} ms`);
      else this.faster();

      if (status === 401 && auth && !reauthed) {
        reauthed = true;
        await this.reauthenticate();
        continue;
      }
      if (status < 200 || status >= 300) {
        throw new ApiError(`${method} ${path}: ${errorMessage(status, body, text)}`, { status, body });
      }
      return { status, data: unwrap(body), latency };
    }
  }

  setTokens(data) {
    const tokens = data && (data.tokens || data);
    if (!tokens || !tokens.accessToken) throw new ApiError('login response has no data.tokens.accessToken');
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken || this.refreshToken;
    this.expiresAt = tokenExpiry(this.accessToken);
  }

  async login() {
    if (!this.email || !this.password) throw new ApiError('IMPORT_EMAIL and IMPORT_PASSWORD must be set');
    this.stats.logins++;
    let res;
    try {
      res = await this.send('POST', '/auth/login', {
        auth: false,
        json: { email: this.email, password: this.password, deviceFingerprint: this.deviceFingerprint },
      });
    } catch (error) {
      throw new ApiError(`login failed: ${error.message}`, { status: error.status });
    }
    this.setTokens(res.data);
  }

  async refresh() {
    this.stats.refreshes++;
    const res = await this.send('POST', '/auth/refresh', { auth: false, json: { refreshToken: this.refreshToken } });
    this.setTokens(res.data);
  }

  async reauthenticate() {
    if (this.refreshToken) {
      try {
        await this.refresh();
        return;
      } catch (error) {
        if (error.retryable) throw error;
        this.log('  token refresh refused, logging in again');
      }
    }
    await this.login();
  }

  async ensureToken() {
    if (!this.accessToken) return this.login();
    if (this.expiresAt && this.expiresAt - Date.now() < 60000) return this.reauthenticate();
    return undefined;
  }
}

module.exports = { ApiClient, ApiError, unwrap, tokenExpiry };
