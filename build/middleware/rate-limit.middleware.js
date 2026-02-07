"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strictRateLimit = exports.studentEndpointsRateLimit = exports.codeRedemptionRateLimit = exports.codeValidationRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Rate limiting middleware for activation code validation
 * Prevents abuse by limiting the number of validation attempts per IP
 */
exports.codeValidationRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: {
        error: 'Too many activation code validation attempts',
        message: 'Please try again later. Maximum 10 attempts per 15 minutes.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Too many activation code validation attempts',
            message: 'Please try again later. Maximum 10 attempts per 15 minutes.',
            retryAfter: '15 minutes'
        });
    },
    skip: (req) => {
        // Skip rate limiting for admin users (optional)
        const user = req.user;
        return user && (user.role === 'ADMIN' || user.role === 'EMPLOYEE');
    }
});
/**
 * Rate limiting middleware for activation code redemption
 * More restrictive to prevent abuse of the redemption system
 */
exports.codeRedemptionRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 redemption attempts per hour
    message: {
        error: 'Too many activation code redemption attempts',
        message: 'Please try again later. Maximum 5 redemption attempts per hour.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Too many activation code redemption attempts',
            message: 'Please try again later. Maximum 5 redemption attempts per hour.',
            retryAfter: '1 hour'
        });
    },
    skip: (req) => {
        // Skip rate limiting for admin users (optional)
        const user = req.user;
        return user && (user.role === 'ADMIN' || user.role === 'EMPLOYEE');
    }
});
/**
 * General rate limiting middleware for student endpoints
 * Provides basic protection against abuse
 */
exports.studentEndpointsRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Please try again later. Maximum 100 requests per 15 minutes.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
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
exports.strictRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 requests per hour
    message: {
        error: 'Rate limit exceeded',
        message: 'This operation is rate limited. Please try again later.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: 'This operation is rate limited. Please try again later.',
            retryAfter: '1 hour'
        });
    }
});
