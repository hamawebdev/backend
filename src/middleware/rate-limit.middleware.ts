import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Limit on activation code attempts. Each signed-in student has their own count:
 * students behind one IP (mobile carrier NAT, campus Wi-Fi) must not use up each
 * other's attempts. The 429 body has the usual error shape, with code
 * RATE_LIMITED and details.retryAfterSeconds.
 */
function activationCodeAttemptLimit(action: string, windowMinutes: number, max: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.user_data?.id;
      return userId ? `student:${userId}` : `ip:${req.ip}`;
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req: Request, res: Response) => {
      const resetTime: Date | undefined = (req as any).rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : windowMinutes * 60;
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: {
          type: 'RateLimitError',
          code: 'RATE_LIMITED',
          message: `Too many activation code ${action} attempts (maximum ${max} per ${windowMinutes} minutes). ` +
            `Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
          details: { retryAfterSeconds },
          timestamp: new Date().toISOString()
        }
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for admin users (optional)
      const user = (req as any).user;
      return user && (user.role === 'ADMIN' || user.role === 'EMPLOYEE');
    }
  });
}

// Activation code validation: 10 attempts per 15 minutes per student
export const codeValidationRateLimit = activationCodeAttemptLimit('validation', 15, 10);

// Activation code redemption: 10 attempts per hour per student
export const codeRedemptionRateLimit = activationCodeAttemptLimit('redemption', 60, 10);

/**
 * General rate limiting middleware for student endpoints
 * Provides basic protection against abuse
 */
export const studentEndpointsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later. Maximum 100 requests per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Please try again later. Maximum 100 requests per 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiting for sensitive operations
 * Used for operations that should be heavily restricted
 */
export const strictRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: {
    error: 'Rate limit exceeded',
    message: 'This operation is rate limited. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'This operation is rate limited. Please try again later.',
      retryAfter: '1 hour'
    });
  }
});

/**
 * Brute-force protection for public auth endpoints (login, register, password reset).
 * Only failed requests count, so many students behind one campus IP can still sign in.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 failed attempts per IP per window
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many attempts',
      message: 'Too many failed attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

const forgotPasswordLimitHandler = (req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    error: 'Too many password reset requests',
    message: 'Too many password reset requests. Please try again later.',
    retryAfter: '15 minutes'
  });
};

/**
 * Password reset requests always look successful (the response never reveals
 * whether the email exists), so authRateLimit, which only counts failures,
 * would never limit them. These limiters count every request: per client IP,
 * and per target email so one address cannot be flooded from many IPs.
 */
export const forgotPasswordIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP per window (campus networks share one IP)
  standardHeaders: true,
  legacyHeaders: false,
  handler: forgotPasswordLimitHandler,
});

export const forgotPasswordEmailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per email address per hour
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after validation, so the email is already trimmed and lowercased
  keyGenerator: (req: Request) => `forgot-password:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  handler: forgotPasswordLimitHandler,
});
