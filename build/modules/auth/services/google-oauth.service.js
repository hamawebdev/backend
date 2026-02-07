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
exports.GoogleOAuthService = void 0;
const tsyringe_1 = require("tsyringe");
const client_1 = require("@prisma/client");
const jwt_utils_1 = __importDefault(require("../../../core/utils/jwt.utils"));
const AppError_1 = require("../../../core/errors/AppError");
let GoogleOAuthService = class GoogleOAuthService {
    constructor(userRepository, refreshTokenRepository, jwt) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwt = jwt;
    }
    /**
     * Handle Google OAuth authentication
     * - Find existing user by googleId
     * - If not found, find by email and link accounts
     * - If no user exists, create new user
     */
    authenticate(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            try {
                const email = (_b = (_a = profile.emails) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value;
                const avatarUrl = (_d = (_c = profile.photos) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.value;
                if (!email) {
                    throw new AppError_1.InternalServerError("Email not provided by Google");
                }
                // Try to find user by googleId first
                let user = yield this.findUserByGoogleId(profile.id);
                let isNewUser = false;
                if (user) {
                    // Existing OAuth user - update avatar if changed
                    if (avatarUrl && avatarUrl !== user.avatarUrl) {
                        user = yield this.userRepository.updateUser(user.id, { avatarUrl });
                    }
                }
                else {
                    // Try to find user by email for account linking
                    const existingUser = yield this.userRepository.findByEmail(email);
                    if (existingUser) {
                        // Link Google account to existing user
                        user = yield this.linkGoogleAccount(existingUser.id, profile.id, avatarUrl);
                    }
                    else {
                        // Create new user
                        user = yield this.createOAuthUser(profile, email, avatarUrl);
                        isNewUser = true;
                    }
                }
                // Check if user is active
                if (!user.isActive) {
                    throw new AppError_1.InternalServerError("Account is deactivated. Please contact support.");
                }
                // Update last login
                yield this.userRepository.updateLastLogin(user.id);
                // Generate tokens
                const tokens = yield this.generateTokens(user);
                return { user, tokens, isNewUser };
            }
            catch (error) {
                if (error instanceof AppError_1.InternalServerError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to authenticate with Google");
            }
        });
    }
    /**
     * Find user by Google ID
     */
    findUserByGoogleId(googleId) {
        return __awaiter(this, void 0, void 0, function* () {
            // We need to add this method to the repository
            // For now, we'll use a workaround by finding through the database
            const prisma = this.userRepository.prisma;
            if (prisma) {
                return prisma.user.findUnique({
                    where: { googleId },
                });
            }
            return null;
        });
    }
    /**
     * Link Google account to existing user
     */
    linkGoogleAccount(userId, googleId, avatarUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {
                googleId,
                authProvider: client_1.AuthProvider.GOOGLE,
                emailVerified: true, // Google already verified the email
            };
            if (avatarUrl) {
                updateData.avatarUrl = avatarUrl;
            }
            return this.userRepository.updateUser(userId, updateData);
        });
    }
    /**
     * Create new OAuth user
     */
    createOAuthUser(profile, email, avatarUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const fullName = profile.displayName ||
                `${((_a = profile.name) === null || _a === void 0 ? void 0 : _a.givenName) || ""} ${((_b = profile.name) === null || _b === void 0 ? void 0 : _b.familyName) || ""}`.trim() ||
                email.split("@")[0];
            const prisma = this.userRepository.prisma;
            if (!prisma) {
                throw new AppError_1.InternalServerError("Database connection not available");
            }
            return prisma.user.create({
                data: {
                    email,
                    fullName,
                    googleId: profile.id,
                    avatarUrl,
                    authProvider: client_1.AuthProvider.GOOGLE,
                    emailVerified: true, // Google already verified the email
                    role: client_1.UserRole.STUDENT,
                    currentYear: client_1.YearLevel.ONE,
                    isActive: true,
                    // passwordHash is optional (null for OAuth users)
                },
            });
        });
    }
    /**
     * Generate JWT tokens for user
     */
    generateTokens(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const jwtPayload = yield this.buildJwtPayload(user);
            const accessToken = this.jwt.generateAccessToken(jwtPayload);
            const refreshToken = this.jwt.generateRefreshToken(user.id, user.email);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 15);
            yield this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);
            return { accessToken, refreshToken };
        });
    }
    /**
     * Build JWT payload from user
     */
    buildJwtPayload(user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get user with subscriptions - cast to any to access subscriptions property
            const userWithSubscriptions = yield this.userRepository.findByIdWithSubscriptions(user.id);
            const subscriptions = ((userWithSubscriptions === null || userWithSubscriptions === void 0 ? void 0 : userWithSubscriptions.subscriptions) || []).map((sub) => {
                var _a, _b, _c, _d, _e;
                return ({
                    id: sub.id,
                    study_pack_id: sub.studyPackId,
                    pack_name: ((_a = sub.studyPack) === null || _a === void 0 ? void 0 : _a.name) || "",
                    pack_type: ((_b = sub.studyPack) === null || _b === void 0 ? void 0 : _b.type) || "",
                    year_number: ((_c = sub.studyPack) === null || _c === void 0 ? void 0 : _c.yearNumber) || undefined,
                    end_date: sub.endDate.toISOString(),
                    days_remaining: Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
                    accessible_year_levels: this.getAccessibleYearLevels((_d = sub.studyPack) === null || _d === void 0 ? void 0 : _d.type, (_e = sub.studyPack) === null || _e === void 0 ? void 0 : _e.yearNumber),
                });
            });
            // Filter active subscriptions
            const now = new Date();
            const activeSubscriptions = subscriptions.filter((sub) => new Date(sub.end_date) >= now);
            // Admin and Employee users don't need subscriptions
            const isAdminOrEmployee = user.role === client_1.UserRole.ADMIN || user.role === client_1.UserRole.EMPLOYEE;
            const hasActiveSubscription = isAdminOrEmployee || activeSubscriptions.length > 0;
            return {
                user_data: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    universityId: user.universityId || undefined,
                    specialtyId: user.specialtyId || undefined,
                    currentYear: user.currentYear || client_1.YearLevel.ONE,
                    emailVerified: user.emailVerified,
                    isActive: user.isActive,
                },
                subscriptions,
                payment_status: hasActiveSubscription ? "active" : "expired",
                has_active_subscription: hasActiveSubscription,
                accessible_study_packs: activeSubscriptions.map((sub) => sub.study_pack_id),
            };
        });
    }
    /**
     * Get accessible year levels based on subscription type
     */
    getAccessibleYearLevels(packType, yearNumber) {
        if (packType === "RESIDENCY") {
            return [client_1.YearLevel.ONE, client_1.YearLevel.TWO, client_1.YearLevel.THREE, client_1.YearLevel.FOUR, client_1.YearLevel.FIVE, client_1.YearLevel.SIX, client_1.YearLevel.SEVEN];
        }
        if (yearNumber) {
            const yearMap = {
                "1": client_1.YearLevel.ONE,
                "2": client_1.YearLevel.TWO,
                "3": client_1.YearLevel.THREE,
                "4": client_1.YearLevel.FOUR,
                "5": client_1.YearLevel.FIVE,
                "6": client_1.YearLevel.SIX,
                "7": client_1.YearLevel.SEVEN,
            };
            const yearLevel = yearMap[yearNumber];
            return yearLevel ? [yearLevel] : [];
        }
        return [];
    }
};
exports.GoogleOAuthService = GoogleOAuthService;
exports.GoogleOAuthService = GoogleOAuthService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("IUserRepository")),
    __param(1, (0, tsyringe_1.inject)("IRefreshTokenRepository")),
    __param(2, (0, tsyringe_1.inject)("jwt")),
    __metadata("design:paramtypes", [Object, Object, jwt_utils_1.default])
], GoogleOAuthService);
