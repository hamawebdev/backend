"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
let AuthController = class AuthController {
    constructor(authService, responseUtils) {
        this.authService = authService;
        this.responseUtils = responseUtils;
    }
    register(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tokens = yield this.authService.register(req.body);
                // Canonical spec: { message, tokens: { accessToken, refreshToken } }
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Registration successful",
                    tokens
                }, 201);
            }
            catch (error) {
                next(error);
            }
        });
    }
    login(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tokens = yield this.authService.login(req.body);
                // Canonical spec: { tokens: { accessToken, refreshToken } } - no message
                this.responseUtils.sendSuccessResponse(res, { tokens });
            }
            catch (error) {
                next(error);
            }
        });
    }
    logout(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const authHeader = req.headers.authorization;
                const token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.substring(7); // Remove 'Bearer ' prefix
                if (token) {
                    yield this.authService.logout(token);
                }
                // Canonical spec: { message: "Logged out successfully" }
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Logged out successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    refresh(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { refreshToken } = req.body;
                const tokens = yield this.authService.refreshTokens(refreshToken);
                // Canonical spec: { tokens: { accessToken, refreshToken } } - no message
                this.responseUtils.sendSuccessResponse(res, { tokens });
            }
            catch (error) {
                next(error);
            }
        });
    }
    verifyEmail(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.authService.verifyEmail(req.body);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Email verified successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    forgotPassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.authService.forgotPassword(req.body);
                // Canonical spec: { message: "Verification code sent to email" }
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Verification code sent to email"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    resetPassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.authService.resetPassword(req.body);
                // Canonical spec: { message: "Password reset successful" }
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Password reset successful"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    getProfile(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    this.responseUtils.sendUnauthorizedResponse(res);
                    return;
                }
                const user = yield this.authService.getProfile(req.user.user_data.id);
                // Canonical spec: flat user object with specific fields
                // { id, email, fullName, role, universityId, specialtyId, currentYear, isActive, createdAt }
                const profileResponse = {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    universityId: user.universityId,
                    specialtyId: user.specialtyId,
                    currentYear: user.currentYear,
                    isActive: user.isActive,
                    createdAt: user.createdAt
                };
                this.responseUtils.sendSuccessResponse(res, profileResponse);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateProfile(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    this.responseUtils.sendUnauthorizedResponse(res);
                    return;
                }
                const user = yield this.authService.updateProfile(req.user.user_data.id, req.body);
                // Canonical spec: return updated user object directly (same shape as GET /auth/profile)
                const profileResponse = {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    universityId: user.universityId,
                    specialtyId: user.specialtyId,
                    currentYear: user.currentYear,
                    isActive: user.isActive,
                    createdAt: user.createdAt
                };
                this.responseUtils.sendSuccessResponse(res, profileResponse);
            }
            catch (error) {
                next(error);
            }
        });
    }
    changePassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    this.responseUtils.sendUnauthorizedResponse(res);
                    return;
                }
                yield this.authService.changePassword(req.user.user_data.id, req.body);
                // Canonical spec: { message: "Password changed successfully" }
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Password changed successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Google OAuth callback handler
     * Redirects to frontend with tokens in query params
     */
    googleCallback(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const oauthResult = req.user;
                if (!oauthResult || !oauthResult.tokens) {
                    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
                    return res.redirect(`${clientUrl}/login?error=oauth_failed`);
                }
                const { tokens, isNewUser } = oauthResult;
                const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
                // Redirect to frontend with tokens
                const redirectUrl = new URL(`${clientUrl}/auth/callback`);
                redirectUrl.searchParams.set("accessToken", tokens.accessToken);
                redirectUrl.searchParams.set("refreshToken", tokens.refreshToken);
                if (isNewUser) {
                    redirectUrl.searchParams.set("isNewUser", "true");
                }
                res.redirect(redirectUrl.toString());
            }
            catch (error) {
                const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
                res.redirect(`${clientUrl}/login?error=oauth_failed`);
            }
        });
    }
};
AuthController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("IAuthService")),
    __param(1, (0, tsyringe_1.inject)("responseUtils")),
    __metadata("design:paramtypes", [Object, response_utils_1.default])
], AuthController);
exports.default = AuthController;
