import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware for activation code validation
 * Prevents abuse by limiting the number of validation attempts per IP
 */
export const codeValidationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many activation code validation attempts',
    message: 'Please try again later. Maximum 10 attempts per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many activation code validation attempts',
      message: 'Please try again later. Maximum 10 attempts per 15 minutes.',
      retryAfter: '15 minutes'
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for admin users (optional)
    const user = (req as any).user;
    return user && (user.role === 'ADMIN' || user.role === 'EMPLOYEE');
  }
});

/**
 * Rate limiting middleware for activation code redemption
 * More restrictive to prevent abuse of the redemption system
 */
export const codeRedemptionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 redemption attempts per hour
  message: {
    error: 'Too many activation code redemption attempts',
    message: 'Please try again later. Maximum 5 redemption attempts per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many activation code redemption attempts',
      message: 'Please try again later. Maximum 5 redemption attempts per hour.',
      retryAfter: '1 hour'
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for admin users (optional)
    const user = (req as any).user;
    return user && (user.role === 'ADMIN' || user.role === 'EMPLOYEE');
  }
});

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
