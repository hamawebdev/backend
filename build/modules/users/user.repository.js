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
const client_1 = require("@prisma/client");
const tsyringe_1 = require("tsyringe");
const db_1 = __importDefault(require("../../config/db"));
let UserRepository = class UserRepository {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.findUnique({
                    where: { id },
                    include: {
                        university: true,
                        specialty: true,
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    findByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.findUnique({
                    where: { email },
                    include: {
                        university: true,
                        specialty: true,
                        subscriptions: {
                            include: {
                                studyPack: true
                            }
                        }
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    createUser(userData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.create({
                    data: {
                        email: userData.email,
                        passwordHash: userData.passwordHash,
                        fullName: userData.fullName,
                        role: userData.role || client_1.UserRole.STUDENT,
                        universityId: userData.universityId,
                        specialtyId: userData.specialtyId,
                        currentYear: userData.currentYear || client_1.YearLevel.ONE,
                    },
                    include: {
                        university: true,
                        specialty: true,
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    updateUser(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.update({
                    where: { id },
                    data,
                    include: {
                        university: true,
                        specialty: true,
                        subscriptions: {
                            include: {
                                studyPack: true
                            }
                        }
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    deleteUser(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.delete({
                    where: { id },
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    findByIdWithSubscriptions(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.findUnique({
                    where: { id },
                    include: {
                        university: true,
                        specialty: true,
                        subscriptions: {
                            include: {
                                studyPack: true
                            },
                            where: {
                                status: 'ACTIVE',
                                endDate: {
                                    gte: new Date()
                                }
                            }
                        }
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    updateLastLogin(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.prisma.user.update({
                    where: { id },
                    data: {
                        lastLogin: new Date()
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    verifyEmail(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.update({
                    where: { id },
                    data: {
                        emailVerified: true
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    updatePassword(id, passwordHash) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.update({
                    where: { id },
                    data: {
                        passwordHash
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    getAllStudyPackIds() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const studyPacks = yield this.prisma.studyPack.findMany({
                    where: { isActive: true },
                    select: { id: true }
                });
                return studyPacks.map(pack => pack.id);
            }
            catch (error) {
                throw error;
            }
        });
    }
    setResetCode(id, code, expiresAt) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.update({
                    where: { id },
                    data: {
                        resetCode: code,
                        resetCodeExpiresAt: expiresAt
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
    clearResetCode(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.prisma.user.update({
                    where: { id },
                    data: {
                        resetCode: null,
                        resetCodeExpiresAt: null
                    }
                });
            }
            catch (error) {
                throw error;
            }
        });
    }
};
UserRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], UserRepository);
exports.default = UserRepository;
