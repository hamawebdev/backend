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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwt_utils_1 = __importDefault(require("../../core/utils/jwt.utils"));
const AppError_1 = require("../../core/errors/AppError");
const client_1 = require("@prisma/client");
let AuthService = class AuthService {
    constructor(userRepository, refreshTokenRepository, jwt) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwt = jwt;
    }
    register(userData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existingUser = yield this.userRepository.findByEmail(userData.email);
                if (existingUser)
                    throw new AppError_1.ConflictError("User already exists");
                const passwordHash = yield bcryptjs_1.default.hash(userData.password, 10);
                const user = yield this.userRepository.createUser({
                    email: userData.email,
                    passwordHash,
                    fullName: userData.fullName,
                    universityId: userData.universityId,
                    specialtyId: userData.specialtyId,
                    currentYear: userData.currentYear,
                });
                // Generate email verification token
                const emailVerificationToken = this.jwt.generateEmailVerificationToken(user.id, user.email);
                // TODO: Send email verification email
                console.log(`Email verification token for ${user.email}: ${emailVerificationToken}`);
                const deviceFingerprint = userData.deviceFingerprint || 'unknown';
                const jwtPayload = yield this.buildJwtPayload(user);
                const accessToken = this.jwt.generateAccessToken(jwtPayload);
                const refreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 25);
                yield this.refreshTokenRepository.create(user.id, refreshToken, expiresAt, deviceFingerprint);
                return { accessToken, refreshToken };
            }
            catch (error) {
                if (error instanceof AppError_1.ConflictError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to register user");
            }
        });
    }
    login(loginData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate input
                if (!loginData.email || !loginData.password) {
                    throw new AppError_1.BadRequestError("Email and password are required");
                }
                const user = yield this.userRepository.findByEmail(loginData.email);
                if (!user) {
                    throw new AppError_1.UnauthorizedError("Invalid email or password. Please check your credentials and try again.");
                }
                if (!user.isActive) {
                    throw new AppError_1.UnauthorizedError("Your account has been deactivated. Please contact support for assistance.");
                }
                // Email verification check disabled - users can login without verifying email
                // if (!user.emailVerified) {
                //   throw new UnauthorizedError("Please verify your email address before logging in. Check your inbox for the verification link.");
                // }
                // Check if user has a password (OAuth users might not have one)
                if (!user.passwordHash) {
                    throw new AppError_1.UnauthorizedError("This account uses Google Sign-In. Please use the 'Continue with Google' button.");
                }
                const isPasswordValid = yield bcryptjs_1.default.compare(loginData.password, user.passwordHash);
                if (!isPasswordValid) {
                    throw new AppError_1.UnauthorizedError("Invalid email or password. Please check your credentials and try again.");
                }
                // Update last login
                yield this.userRepository.updateLastLogin(user.id);
                const deviceFingerprint = loginData.deviceFingerprint || 'unknown';
                const jwtPayload = yield this.buildJwtPayload(user);
                const accessToken = this.jwt.generateAccessToken(jwtPayload);
                const refreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 25);
                yield this.refreshTokenRepository.create(user.id, refreshToken, expiresAt, deviceFingerprint);
                return { accessToken, refreshToken };
            }
            catch (error) {
                if (error instanceof AppError_1.UnauthorizedError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                console.error("Login error:", error);
                throw new AppError_1.InternalServerError("We're experiencing technical difficulties. Please try again later.");
            }
        });
    }
    refreshTokens(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!refreshToken) {
                    throw new AppError_1.BadRequestError("Refresh token is required");
                }
                // Get full payload including device fingerprint
                const { userId, deviceFingerprint } = this.jwt.getRefreshTokenPayload(refreshToken);
                const storedRefreshToken = yield this.refreshTokenRepository.findByUserId(userId);
                if (!storedRefreshToken) {
                    throw new AppError_1.UnauthorizedError("Refresh token not found. Please log in again.");
                }
                if (storedRefreshToken.token !== refreshToken) {
                    throw new AppError_1.UnauthorizedError("Invalid refresh token. Please log in again.");
                }
                if (storedRefreshToken.expiresAt < new Date()) {
                    throw new AppError_1.UnauthorizedError("Refresh token has expired. Please log in again.");
                }
                // Validate device fingerprint for single-device enforcement
                if (storedRefreshToken.deviceFingerprint &&
                    storedRefreshToken.deviceFingerprint !== deviceFingerprint) {
                    throw new AppError_1.UnauthorizedError("Session invalidated. You've logged in on another device. Please log in again.");
                }
                // Re-query user with subscriptions to get fresh subscription status
                const user = yield this.userRepository.findByIdWithSubscriptions(userId);
                if (!user) {
                    throw new AppError_1.UnauthorizedError("User account not found. Please contact support.");
                }
                if (!user.isActive) {
                    throw new AppError_1.UnauthorizedError("Your account has been deactivated. Please contact support for assistance.");
                }
                // Rebuild JWT payload with fresh subscription data from database
                const jwtPayload = yield this.buildJwtPayload(user);
                const newAccessToken = this.jwt.generateAccessToken(jwtPayload);
                const newRefreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 25);
                yield this.refreshTokenRepository.updateByUserId(user.id, newRefreshToken, expiresAt, deviceFingerprint);
                return { accessToken: newAccessToken, refreshToken: newRefreshToken };
            }
            catch (error) {
                if (error instanceof AppError_1.UnauthorizedError ||
                    error instanceof AppError_1.NotFoundError ||
                    error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                console.error("Token refresh error:", error);
                throw new AppError_1.InternalServerError("We're experiencing technical difficulties. Please try again later.");
            }
        });
    }
    logout(token) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userId = this.jwt.getUserIdFromToken(token);
                yield this.refreshTokenRepository.deleteByUserId(userId);
            }
            catch (error) {
                if (error instanceof AppError_1.UnauthorizedError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to logout");
            }
        });
    }
    verifyEmail(data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { userId } = this.jwt.verifySpecialToken(data.token, "email_verification");
                yield this.userRepository.verifyEmail(userId);
            }
            catch (error) {
                if (error instanceof AppError_1.UnauthorizedError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to verify email");
            }
        });
    }
    forgotPassword(data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.userRepository.findByEmail(data.email);
                if (!user) {
                    // Don't reveal if email exists for security
                    return;
                }
                // Generate 6-character alphanumeric code (canonical spec)
                const resetCode = this.generateResetCode();
                // Code expires in 15 minutes
                const expiresAt = new Date();
                expiresAt.setMinutes(expiresAt.getMinutes() + 15);
                yield this.userRepository.setResetCode(user.id, resetCode, expiresAt);
                // TODO: Send password reset email with code
                console.log(`Password reset code for ${user.email}: ${resetCode}`);
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to process password reset request");
            }
        });
    }
    resetPassword(data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Find user by email
                const user = yield this.userRepository.findByEmail(data.email);
                if (!user) {
                    throw new AppError_1.BadRequestError("Invalid or expired code");
                }
                // Verify the reset code
                if (!user.resetCode || user.resetCode !== data.code) {
                    throw new AppError_1.BadRequestError("Invalid or expired code");
                }
                // Check if code has expired
                if (!user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
                    throw new AppError_1.BadRequestError("Invalid or expired code");
                }
                // Update password
                const passwordHash = yield bcryptjs_1.default.hash(data.newPassword, 10);
                yield this.userRepository.updatePassword(user.id, passwordHash);
                // Clear the reset code
                yield this.userRepository.clearResetCode(user.id);
                // Invalidate all refresh tokens for security
                yield this.refreshTokenRepository.deleteByUserId(user.id);
            }
            catch (error) {
                if (error instanceof AppError_1.BadRequestError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to reset password");
            }
        });
    }
    /**
     * Generate a 6-character alphanumeric reset code
     */
    generateResetCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    changePassword(userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!data.currentPassword || !data.newPassword) {
                    throw new AppError_1.BadRequestError("Both current password and new password are required");
                }
                if (data.newPassword.length < 4) {
                    throw new AppError_1.BadRequestError("New password must be at least 4 characters long");
                }
                if (data.currentPassword === data.newPassword) {
                    throw new AppError_1.BadRequestError("New password must be different from your current password");
                }
                const user = yield this.userRepository.findById(userId);
                if (!user) {
                    throw new AppError_1.NotFoundError("User account not found");
                }
                // Check if user has a password (OAuth users might not have one)
                if (!user.passwordHash) {
                    throw new AppError_1.BadRequestError("This account uses Google Sign-In and does not have a password.");
                }
                const isCurrentPasswordValid = yield bcryptjs_1.default.compare(data.currentPassword, user.passwordHash);
                if (!isCurrentPasswordValid) {
                    throw new AppError_1.BadRequestError("Current password is incorrect. Please verify your current password and try again.");
                }
                const passwordHash = yield bcryptjs_1.default.hash(data.newPassword, 10);
                yield this.userRepository.updatePassword(userId, passwordHash);
                // Invalidate all refresh tokens for security
                yield this.refreshTokenRepository.deleteByUserId(userId);
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError ||
                    error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                console.error("Change password error:", error);
                throw new AppError_1.InternalServerError("We're experiencing technical difficulties. Please try again later.");
            }
        });
    }
    updateProfile(userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.userRepository.findById(userId);
                if (!user)
                    throw new AppError_1.NotFoundError("User");
                return yield this.userRepository.updateUser(userId, data);
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update profile");
            }
        });
    }
    getProfile(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.userRepository.findByIdWithSubscriptions(userId);
                if (!user)
                    throw new AppError_1.NotFoundError("User");
                return user;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to get profile");
            }
        });
    }
    buildJwtPayload(user) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Use date-based filtering for active subscriptions (endDate is the source of truth)
            const now = new Date();
            const activeSubscriptions = ((_a = user.subscriptions) === null || _a === void 0 ? void 0 : _a.filter((sub) => new Date(sub.endDate) > now)) || [];
            // Collect primary year levels from active subscriptions for currentYear determination
            const primaryYearLevels = new Set();
            // Build subscriptions with accessible year levels (fully optimized - no database queries)
            const subscriptions = activeSubscriptions.map((sub) => {
                const endDate = new Date(sub.endDate);
                const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                // Determine accessible year levels directly from study pack metadata (no DB queries)
                let accessibleYearLevels = [];
                let primaryYearLevel = null;
                if (sub.studyPack.type === 'RESIDENCY') {
                    // Residency subscriptions have access to all year levels
                    accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
                    // For residency, we don't add a specific primary year - let it use user's original year
                }
                else if (sub.studyPack.type === 'YEAR') {
                    // Year-specific packs: determine accessible years from study pack's yearNumber
                    if (sub.studyPack.yearNumber) {
                        // Use the study pack's year number as the primary year for currentYear determination
                        primaryYearLevel = sub.studyPack.yearNumber;
                        primaryYearLevels.add(primaryYearLevel);
                        // For accessible year levels, use comprehensive access as per business logic
                        accessibleYearLevels = this.getAccessibleYearLevelsForYearPack(primaryYearLevel);
                    }
                    else {
                        // If pack doesn't specify a year, grant access to all years (fallback)
                        accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
                    }
                }
                else {
                    // Unknown pack type - grant access to all years (fallback)
                    accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
                }
                return {
                    id: sub.id,
                    study_pack_id: sub.studyPackId,
                    pack_name: sub.studyPack.name,
                    pack_type: sub.studyPack.type.toLowerCase(),
                    year_number: sub.studyPack.yearNumber,
                    end_date: sub.endDate.toISOString(),
                    days_remaining: Math.max(0, daysRemaining),
                    accessible_year_levels: accessibleYearLevels
                };
            });
            // Admin and Employee users don't need subscriptions - they have full access
            const isAdminOrEmployee = user.role === client_1.UserRole.ADMIN || user.role === client_1.UserRole.EMPLOYEE;
            const hasActiveSubscription = isAdminOrEmployee || activeSubscriptions.length > 0;
            const paymentStatus = isAdminOrEmployee || hasActiveSubscription ? 'active' : 'pending';
            // For admin/employee users, give access to all study packs
            let accessibleStudyPacks;
            if (isAdminOrEmployee) {
                // Get all study pack IDs for admin/employee access
                const allStudyPacks = yield this.userRepository.getAllStudyPackIds();
                accessibleStudyPacks = allStudyPacks;
                // Admin/Employee users have access to all year levels - add highest year as primary
                primaryYearLevels.add('SEVEN');
            }
            else {
                accessibleStudyPacks = activeSubscriptions.map((sub) => sub.studyPackId);
            }
            // Determine currentYear from subscription-based year levels
            const currentYear = this.determineCurrentYearFromSubscriptions(primaryYearLevels, user.currentYear || 'ONE');
            return {
                user_data: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    universityId: user.universityId || undefined,
                    specialtyId: user.specialtyId || undefined,
                    currentYear: currentYear,
                    emailVerified: user.emailVerified,
                    isActive: user.isActive,
                },
                subscriptions,
                payment_status: paymentStatus,
                has_active_subscription: hasActiveSubscription,
                accessible_study_packs: accessibleStudyPacks,
            };
        });
    }
    /**
     * Determine accessible year levels for year-specific study packs
     * Year-specific subscriptions should only grant access to their specific year level
     */
    getAccessibleYearLevelsForYearPack(primaryYear) {
        // Year-specific subscriptions grant access only to their specific year level
        // This ensures proper access control and prevents unauthorized access to other year levels
        return [primaryYear];
    }
    /**
     * Determine the currentYear field for JWT token based on active subscription year levels
     * Handles multiple active subscriptions with different year levels appropriately
     */
    determineCurrentYearFromSubscriptions(allYearLevels, fallbackYear) {
        // If no year levels from subscriptions, use the fallback (original user.currentYear)
        if (allYearLevels.size === 0) {
            return fallbackYear;
        }
        // Convert Set to Array for easier processing
        const yearLevelsArray = Array.from(allYearLevels);
        // If user has only one year level from subscriptions, use it
        if (yearLevelsArray.length === 1) {
            return yearLevelsArray[0];
        }
        // If user has multiple year levels, prioritize based on business logic:
        // 1. If the user's original currentYear is among the accessible years, keep it
        if (allYearLevels.has(fallbackYear)) {
            return fallbackYear;
        }
        // 2. Otherwise, choose the highest year level (most advanced)
        // Define year level order for comparison
        const yearOrder = {
            'ONE': 1,
            'TWO': 2,
            'THREE': 3,
            'FOUR': 4,
            'FIVE': 5,
            'SIX': 6,
            'SEVEN': 7
        };
        // Find the highest year level
        const highestYear = yearLevelsArray.reduce((highest, current) => {
            return yearOrder[current] > yearOrder[highest] ? current : highest;
        });
        return highestYear;
    }
};
AuthService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("IUserRepository")),
    __param(1, (0, tsyringe_1.inject)("IRefreshTokenRepository")),
    __param(2, (0, tsyringe_1.inject)("jwt")),
    __metadata("design:paramtypes", [Object, Object, jwt_utils_1.default])
], AuthService);
exports.default = AuthService;
