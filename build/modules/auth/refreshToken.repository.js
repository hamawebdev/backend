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
const db_1 = __importDefault(require("../../config/db"));
let RefreshTokenRepository = class RefreshTokenRepository {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    create(userId, token, expiresAt, deviceFingerprint) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Delete any existing refresh token for this user first
                yield this.deleteByUserId(userId);
                return yield this.prisma.refreshToken.create({
                    data: {
                        userId,
                        token,
                        expiresAt,
                        deviceFingerprint,
                    },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    findByUserId(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.prisma.refreshToken.findFirst({
                    where: { userId },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    findByToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.prisma.refreshToken.findUnique({
                    where: { token },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    updateByUserId(userId, token, expiresAt, deviceFingerprint) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First find the existing token for this user
                const existingToken = yield this.findByUserId(userId);
                if (!existingToken) {
                    // If no existing token, create a new one
                    return yield this.create(userId, token, expiresAt, deviceFingerprint);
                }
                // Update using the token as unique identifier
                return yield this.prisma.refreshToken.update({
                    where: { token: existingToken.token },
                    data: {
                        token,
                        expiresAt,
                        deviceFingerprint,
                    },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    deleteByUserId(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.prisma.refreshToken.deleteMany({
                    where: { userId },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    deleteByToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.prisma.refreshToken.delete({
                    where: { token },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    deleteExpiredTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.prisma.refreshToken.deleteMany({
                    where: {
                        expiresAt: {
                            lt: new Date(),
                        },
                    },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
};
RefreshTokenRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], RefreshTokenRepository);
exports.default = RefreshTokenRepository;
