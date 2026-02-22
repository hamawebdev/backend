"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const jwt = __importStar(require("jsonwebtoken"));
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
let JwtUtils = class JwtUtils {
    constructor() {
        var _a, _b;
        this.JWT_SECRET = (_a = process.env.JWT_SECRET) !== null && _a !== void 0 ? _a : "your-secret-key";
        this.JWT_EXPIRATION = process.env.JWT_EXPIRATION || process.env.JWT_EXPIRES_IN || "15m";
        this.REFRESH_TOKEN_SECRET = (_b = process.env.REFRESH_TOKEN_SECRET) !== null && _b !== void 0 ? _b : "your-refresh-secret";
        this.REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "25d";
        if (!process.env.JWT_SECRET) {
            console.warn("⚠️ WARNING: JWT_SECRET is not set. Using default value. This is a security risk.");
        }
        if (!process.env.REFRESH_TOKEN_SECRET) {
            console.warn("⚠️ WARNING: REFRESH_TOKEN_SECRET is not set. Using default value. Tokens will be invalidated on restart.");
        }
        console.log(`🔑 JWT configured: accessToken expiry=${this.JWT_EXPIRATION}, refreshToken expiry=${this.REFRESH_TOKEN_EXPIRY}`);
    }
    generateAccessToken(payload) {
        const options = { expiresIn: this.JWT_EXPIRATION };
        return jwt.sign(payload, String(this.JWT_SECRET), options);
    }
    generateRefreshToken(userId, email, deviceFingerprint = 'unknown') {
        const options = { expiresIn: this.REFRESH_TOKEN_EXPIRY };
        return jwt.sign({ userId, email, deviceFingerprint }, String(this.REFRESH_TOKEN_SECRET), options);
    }
    verifyAccessToken(token) {
        try {
            jwt.verify(token, String(this.JWT_SECRET));
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    verifyRefreshToken(token) {
        try {
            jwt.verify(token, String(this.REFRESH_TOKEN_SECRET));
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    getUserIdFromToken(token) {
        try {
            const decoded = jwt.verify(token, String(this.JWT_SECRET));
            return decoded.user_data.id;
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError_1.UnauthorizedError("Your session has expired. Please log in again.");
            }
            else if (error.name === 'JsonWebTokenError') {
                throw new AppError_1.UnauthorizedError("Invalid authentication token. Please log in again.");
            }
            else {
                throw new AppError_1.UnauthorizedError("Authentication failed. Please log in again.");
            }
        }
    }
    getUserFromToken(token) {
        try {
            const decoded = jwt.verify(token, String(this.JWT_SECRET));
            return decoded;
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError_1.UnauthorizedError("Your session has expired. Please log in again.");
            }
            else if (error.name === 'JsonWebTokenError') {
                throw new AppError_1.UnauthorizedError("Invalid authentication token. Please log in again.");
            }
            else {
                throw new AppError_1.UnauthorizedError("Authentication failed. Please log in again.");
            }
        }
    }
    getUserFromRefreshToken(token) {
        try {
            const decoded = jwt.verify(token, String(this.REFRESH_TOKEN_SECRET));
            return decoded.userId;
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError_1.UnauthorizedError("Refresh token has expired. Please log in again.");
            }
            else if (error.name === 'JsonWebTokenError') {
                throw new AppError_1.UnauthorizedError("Invalid refresh token. Please log in again.");
            }
            else {
                throw new AppError_1.UnauthorizedError("Token validation failed. Please log in again.");
            }
        }
    }
    getRefreshTokenPayload(token) {
        try {
            const decoded = jwt.verify(token, String(this.REFRESH_TOKEN_SECRET));
            return {
                userId: decoded.userId,
                email: decoded.email,
                deviceFingerprint: decoded.deviceFingerprint || 'unknown'
            };
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError_1.UnauthorizedError("Refresh token has expired. Please log in again.");
            }
            else if (error.name === 'JsonWebTokenError') {
                throw new AppError_1.UnauthorizedError("Invalid refresh token. Please log in again.");
            }
            else {
                throw new AppError_1.UnauthorizedError("Token validation failed. Please log in again.");
            }
        }
    }
    // Generate password reset token
    generatePasswordResetToken(userId, email) {
        const options = { expiresIn: "1h" }; // Reset token expires in 1 hour
        return jwt.sign({ userId, email, type: "password_reset" }, String(this.JWT_SECRET), options);
    }
    // Generate email verification token
    generateEmailVerificationToken(userId, email) {
        const options = { expiresIn: "24h" }; // Verification token expires in 24 hours
        return jwt.sign({ userId, email, type: "email_verification" }, String(this.JWT_SECRET), options);
    }
    // Verify special tokens (password reset, email verification)
    verifySpecialToken(token, expectedType) {
        try {
            const decoded = jwt.verify(token, String(this.JWT_SECRET));
            if (decoded.type !== expectedType) {
                throw new AppError_1.UnauthorizedError(`Invalid token type. Expected ${expectedType} token.`);
            }
            return { userId: decoded.userId, email: decoded.email };
        }
        catch (error) {
            if (error instanceof AppError_1.UnauthorizedError) {
                throw error;
            }
            if (error.name === 'TokenExpiredError') {
                const tokenTypeMap = {
                    'email_verification': 'Email verification link',
                    'password_reset': 'Password reset link'
                };
                const tokenName = tokenTypeMap[expectedType] || 'Token';
                throw new AppError_1.UnauthorizedError(`${tokenName} has expired. Please request a new one.`);
            }
            else if (error.name === 'JsonWebTokenError') {
                throw new AppError_1.UnauthorizedError("Invalid token. Please request a new verification link.");
            }
            else {
                throw new AppError_1.UnauthorizedError("Token verification failed. Please try again.");
            }
        }
    }
};
JwtUtils = __decorate([
    (0, tsyringe_1.singleton)(),
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [])
], JwtUtils);
exports.default = JwtUtils;
