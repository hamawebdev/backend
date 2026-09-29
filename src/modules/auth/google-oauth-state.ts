import crypto from "crypto";
import { Request } from "express";

/**
 * CSRF protection for the Google OAuth flow (the OAuth `state` parameter)
 * without server sessions.
 *
 * GET /auth/google creates a random nonce, sends it to Google as `state` and
 * keeps it in a short-lived, signed, httpOnly cookie. The callback only
 * proceeds when Google returns the same `state` and this browser still holds
 * the matching cookie, so a callback URL carrying someone else's
 * authorization code (login CSRF) is rejected. The cookie is single use.
 */

const COOKIE_NAME = "medadn_google_oauth_state";
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to complete the Google consent screen

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: boolean, info?: any) => void;

function signingKey(): string {
  // JwtUtils refuses to start in production without JWT_SECRET; same dev fallback
  return `google-oauth-state:${process.env.JWT_SECRET ?? "your-secret-key"}`;
}

function sign(nonce: string, expiresAt: number): string {
  return crypto.createHmac("sha256", signingKey()).update(`${nonce}.${expiresAt}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The cookie is host-only unless Google redirects back to a different host of
 * the same site (e.g. the flow starts on api.example.com and
 * GOOGLE_CALLBACK_URL points at example.com/api/...). Then the cookie is
 * scoped to the parent domain so the callback host receives it.
 */
function cookieDomain(req: Request): string | undefined {
  const requestHost = (req.hostname || "").toLowerCase();
  const callbackHost = hostOf(process.env.GOOGLE_CALLBACK_URL);
  if (!requestHost || !callbackHost || requestHost === callbackHost) return undefined;
  if (requestHost.endsWith(`.${callbackHost}`)) return callbackHost;
  if (callbackHost.endsWith(`.${requestHost}`)) return requestHost;
  return undefined;
}

/**
 * Domain the state cookie was set with, carried as the last field of its value
 * (base64url, empty for a host-only cookie). verify() runs on the callback host,
 * where cookieDomain() cannot know which host started the flow, and a cookie is
 * only cleared by a Set-Cookie with the same Domain attribute. Values without the
 * field, or naming a domain this host is not part of, fall back to cookieDomain().
 */
function encodeDomain(domain: string | undefined): string {
  return domain ? Buffer.from(domain).toString("base64url") : "";
}

function storedDomain(req: Request, encoded: string | undefined): string | undefined {
  if (encoded === undefined) return cookieDomain(req);
  if (encoded === "") return undefined;
  const domain = Buffer.from(encoded, "base64url").toString().toLowerCase();
  const host = (req.hostname || "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`) ? domain : cookieDomain(req);
}

function cookieOptions(req: Request, domain: string | undefined) {
  return {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // sent on the top-level redirect back from Google
    // Covers both /auth/google and /auth/google/callback under the router mount
    path: `${req.baseUrl || ""}/google`,
    domain,
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * State store for passport-oauth2 (`store` strategy option). Passport picks
 * the call signature from the function arity: store(req, meta, cb) and
 * verify(req, state, cb).
 */
export class GoogleOAuthCookieStateStore {
  store(req: Request, _meta: unknown, callback: StoreCallback): void {
    const res = req.res;
    if (!res) {
      callback(new Error("Cannot start Google sign-in: no response object"));
      return;
    }
    const nonce = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + MAX_AGE_MS;
    const domain = cookieDomain(req);
    res.cookie(COOKIE_NAME, `${nonce}.${expiresAt}.${sign(nonce, expiresAt)}.${encodeDomain(domain)}`, {
      ...cookieOptions(req, domain),
      maxAge: MAX_AGE_MS,
    });
    callback(null, nonce);
  }

  verify(req: Request, providedState: string, callback: VerifyCallback): void {
    const cookieValue = readCookie(req, COOKIE_NAME);
    const [nonce, expiresAtRaw, signature, encodedDomain] = (cookieValue ?? "").split(".");
    // Single use: clear it whatever the outcome, with the domain it was set with
    req.res?.clearCookie(COOKIE_NAME, cookieOptions(req, storedDomain(req, encodedDomain)));

    const reject = (message: string) => callback(null, false, { message });

    if (!cookieValue || typeof providedState !== "string" || !providedState) {
      return reject("Missing OAuth state");
    }
    const expiresAt = Number(expiresAtRaw);
    if (!nonce || !signature || !Number.isFinite(expiresAt)) {
      return reject("Malformed OAuth state");
    }
    if (!safeEqual(signature, sign(nonce, expiresAt))) {
      return reject("Invalid OAuth state");
    }
    if (expiresAt < Date.now()) {
      return reject("Expired OAuth state");
    }
    if (!safeEqual(providedState, nonce)) {
      return reject("OAuth state mismatch");
    }
    callback(null, true);
  }
}
