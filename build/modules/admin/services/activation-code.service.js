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
exports.ActivationCodeService = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../../../core/errors/AppError");
const db_1 = __importDefault(require("../../../config/db"));
// Helper to generate random activation code
function generateActivationCode(length = 12) {
    var _a;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Add dashes for readability (e.g., XXXX-XXXX-XXXX)
    return ((_a = code.match(/.{1,4}/g)) === null || _a === void 0 ? void 0 : _a.join('-')) || code;
}
let ActivationCodeService = class ActivationCodeService {
    constructor(prismaService) {
        this.prismaService = prismaService;
        this.prisma = this.prismaService.getClient();
    }
    /**
     * Create a new activation code (Canonical spec)
     * POST /admin/activation-codes
     * Supports: auto-generated code, multiple study packs, duration types (MONTHS/DAYS)
     */
    createActivationCode(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Generate code if not provided
            let code = data.code;
            if (!code) {
                code = generateActivationCode();
                // Ensure uniqueness
                let attempts = 0;
                while (attempts < 10) {
                    const existingCode = yield this.prisma.activationCode.findUnique({
                        where: { code }
                    });
                    if (!existingCode)
                        break;
                    code = generateActivationCode();
                    attempts++;
                }
                if (attempts >= 10) {
                    throw new AppError_1.BadRequestError("Failed to generate unique activation code. Please try again.");
                }
            }
            else {
                // Check if provided code already exists
                const existingCode = yield this.prisma.activationCode.findUnique({
                    where: { code }
                });
                if (existingCode) {
                    throw new AppError_1.BadRequestError("Activation code already exists");
                }
            }
            // Get study pack IDs - support both single and array formats
            const studyPackIds = [];
            if (data.studyPackIds && data.studyPackIds.length > 0) {
                studyPackIds.push(...data.studyPackIds);
            }
            else if (data.studyPackId) {
                studyPackIds.push(data.studyPackId);
            }
            if (studyPackIds.length === 0) {
                throw new AppError_1.BadRequestError("At least one study pack must be specified");
            }
            // Verify all study packs exist
            const existingStudyPacks = yield this.prisma.studyPack.findMany({
                where: { id: { in: studyPackIds } }
            });
            if (existingStudyPacks.length !== studyPackIds.length) {
                const foundIds = existingStudyPacks.map(sp => sp.id);
                const missingIds = studyPackIds.filter(id => !foundIds.includes(id));
                throw new AppError_1.NotFoundError(`Study pack(s) not found: ${missingIds.join(', ')}`);
            }
            // Handle duration based on type - store both fields correctly
            const durationType = data.durationType || 'MONTHS';
            let durationMonths = 1; // Default for MONTHS type
            let durationDays = null;
            if (durationType === 'DAYS' && data.durationDays) {
                durationDays = data.durationDays;
                durationMonths = 1; // Minimum value to satisfy schema, not used for DAYS type
            }
            else if (durationType === 'MONTHS') {
                durationMonths = data.durationMonths || 1;
            }
            // Get expiry date - support both field names
            const expiryDate = data.expiresAt || data.expiryDate;
            const expiresAt = expiryDate
                ? new Date(expiryDate)
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
            // Create the activation code with all study pack relations
            const activationCode = yield this.prisma.activationCode.create({
                data: {
                    code: code,
                    hashedCode: code, // Simplified - in production use proper hashing
                    description: data.description,
                    durationType: durationType,
                    durationMonths: durationMonths,
                    durationDays: durationDays,
                    maxUses: data.maxUses || 100,
                    currentUses: 0,
                    isActive: (_a = data.isActive) !== null && _a !== void 0 ? _a : true,
                    expiresAt: expiresAt,
                    createdById,
                    studyPacks: {
                        create: studyPackIds.map(studyPackId => ({
                            studyPackId
                        }))
                    }
                },
                include: {
                    studyPacks: {
                        include: {
                            studyPack: true
                        }
                    }
                }
            });
            // Return canonical format
            return this.toCanonicalFormat(activationCode);
        });
    }
    /**
     * Get all activation codes with filtering and pagination (Canonical spec)
     * GET /admin/activation-codes
     */
    getAllActivationCodes(filters_1) {
        return __awaiter(this, arguments, void 0, function* (filters, page = 1, limit = 10) {
            const skip = (page - 1) * limit;
            const whereConditions = {};
            if (filters.isActive !== undefined) {
                whereConditions.isActive = filters.isActive;
            }
            if (filters.search) {
                whereConditions.OR = [
                    { code: { contains: filters.search, mode: 'insensitive' } },
                    { description: { contains: filters.search, mode: 'insensitive' } }
                ];
            }
            if (filters.studyPackId) {
                whereConditions.studyPacks = {
                    some: {
                        studyPackId: filters.studyPackId
                    }
                };
            }
            if (filters.expiryDate) {
                whereConditions.expiresAt = {
                    lte: new Date(filters.expiryDate)
                };
            }
            const [activationCodes, total] = yield Promise.all([
                this.prisma.activationCode.findMany({
                    where: whereConditions,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: 'desc'
                    },
                    include: {
                        studyPacks: {
                            include: {
                                studyPack: true
                            }
                        },
                        redemptions: true
                    }
                }),
                this.prisma.activationCode.count({
                    where: whereConditions
                })
            ]);
            // Transform to canonical format
            const items = activationCodes.map(code => this.toCanonicalFormat(code));
            return {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        });
    }
    /**
     * Get activation code by ID with usage history (Canonical spec)
     * GET /admin/activation-codes/:id
     */
    getActivationCodeById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const activationCode = yield this.prisma.activationCode.findUnique({
                where: { id },
                include: {
                    studyPacks: {
                        include: {
                            studyPack: true
                        }
                    },
                    redemptions: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    fullName: true
                                }
                            }
                        },
                        orderBy: {
                            redeemedAt: 'desc'
                        }
                    }
                }
            });
            if (!activationCode) {
                throw new AppError_1.NotFoundError("Activation code not found");
            }
            // Build usage history
            const usageHistory = activationCode.redemptions.map(redemption => ({
                userId: redemption.user.id,
                userName: redemption.user.fullName,
                redeemedAt: redemption.redeemedAt.toISOString()
            }));
            const result = this.toCanonicalFormat(activationCode);
            return Object.assign(Object.assign({}, result), { usageHistory });
        });
    }
    /**
     * Update activation code (Canonical spec)
     * PUT /admin/activation-codes/:id
     */
    updateActivationCode(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingCode = yield this.prisma.activationCode.findUnique({
                where: { id }
            });
            if (!existingCode) {
                throw new AppError_1.NotFoundError("Activation code not found");
            }
            // Check if new code conflicts with existing
            if (data.code && data.code !== existingCode.code) {
                const codeConflict = yield this.prisma.activationCode.findUnique({
                    where: { code: data.code }
                });
                if (codeConflict) {
                    throw new AppError_1.BadRequestError("Activation code already exists");
                }
            }
            // If studyPackId is being updated, verify it exists
            if (data.studyPackId) {
                const studyPack = yield this.prisma.studyPack.findUnique({
                    where: { id: data.studyPackId }
                });
                if (!studyPack) {
                    throw new AppError_1.NotFoundError("Study pack not found");
                }
            }
            // Build update data
            const updateData = {};
            if (data.code !== undefined) {
                updateData.code = data.code;
                updateData.hashedCode = data.code;
            }
            if (data.expiryDate !== undefined) {
                updateData.expiresAt = new Date(data.expiryDate);
            }
            if (data.maxUses !== undefined) {
                updateData.maxUses = data.maxUses;
            }
            if (data.durationMonths !== undefined) {
                updateData.durationMonths = data.durationMonths;
            }
            if (data.isActive !== undefined) {
                updateData.isActive = data.isActive;
            }
            // Update activation code
            const updatedCode = yield this.prisma.activationCode.update({
                where: { id },
                data: updateData,
                include: {
                    studyPacks: {
                        include: {
                            studyPack: true
                        }
                    },
                    redemptions: true
                }
            });
            // If studyPackId changed, update the relation
            if (data.studyPackId) {
                // Remove existing study pack relations
                yield this.prisma.activationCodeStudyPack.deleteMany({
                    where: { activationCodeId: id }
                });
                // Create new relation
                yield this.prisma.activationCodeStudyPack.create({
                    data: {
                        activationCodeId: id,
                        studyPackId: data.studyPackId
                    }
                });
                // Refetch with updated relations
                const refreshedCode = yield this.prisma.activationCode.findUnique({
                    where: { id },
                    include: {
                        studyPacks: {
                            include: {
                                studyPack: true
                            }
                        },
                        redemptions: true
                    }
                });
                return this.toCanonicalFormatWithUpdatedAt(refreshedCode);
            }
            return this.toCanonicalFormatWithUpdatedAt(updatedCode);
        });
    }
    /**
     * Delete activation code (Canonical spec)
     * DELETE /admin/activation-codes/:id
     */
    deleteActivationCode(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const activationCode = yield this.prisma.activationCode.findUnique({
                where: { id }
            });
            if (!activationCode) {
                throw new AppError_1.NotFoundError("Activation code not found");
            }
            yield this.prisma.activationCode.delete({
                where: { id }
            });
            return { message: "Activation code deleted successfully" };
        });
    }
    /**
     * Deactivate an activation code (Canonical spec)
     * PATCH /admin/activation-codes/:id/deactivate
     */
    deactivateActivationCode(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const activationCode = yield this.prisma.activationCode.findUnique({
                where: { id }
            });
            if (!activationCode) {
                throw new AppError_1.NotFoundError("Activation code not found");
            }
            if (!activationCode.isActive) {
                throw new AppError_1.BadRequestError("Activation code is already deactivated");
            }
            const deactivatedCode = yield this.prisma.activationCode.update({
                where: { id },
                data: { isActive: false }
            });
            // Return canonical format for deactivate endpoint
            return {
                id: deactivatedCode.id,
                code: deactivatedCode.code,
                isActive: deactivatedCode.isActive,
                deactivatedAt: deactivatedCode.updatedAt.toISOString()
            };
        });
    }
    /**
     * Transform activation code to canonical format
     * Supports both single studyPack (legacy) and multiple studyPacks (new format)
     */
    toCanonicalFormat(activationCode) {
        var _a, _b, _c;
        // Get all study packs
        const studyPacksList = ((_a = activationCode.studyPacks) === null || _a === void 0 ? void 0 : _a.map((sp) => ({
            id: sp.studyPack.id,
            name: sp.studyPack.name
        }))) || [];
        // Legacy single study pack support
        const firstStudyPack = studyPacksList[0] || null;
        // Return duration fields based on durationType
        const durationType = activationCode.durationType || 'MONTHS';
        const durationFields = durationType === 'DAYS'
            ? { durationType, durationDays: activationCode.durationDays }
            : { durationType, durationMonths: activationCode.durationMonths };
        return Object.assign(Object.assign({ id: activationCode.id, code: activationCode.code, description: activationCode.description || null, 
            // Legacy single study pack fields
            studyPackId: (firstStudyPack === null || firstStudyPack === void 0 ? void 0 : firstStudyPack.id) || null, studyPack: firstStudyPack, 
            // New format: array of study packs
            studyPacks: studyPacksList, expiryDate: ((_b = activationCode.expiresAt) === null || _b === void 0 ? void 0 : _b.toISOString()) || null, expiresAt: ((_c = activationCode.expiresAt) === null || _c === void 0 ? void 0 : _c.toISOString()) || null, maxUses: activationCode.maxUses, currentUses: activationCode.currentUses }, durationFields), { isActive: activationCode.isActive, createdAt: activationCode.createdAt.toISOString() });
    }
    /**
     * Transform activation code to canonical format with updatedAt
     */
    toCanonicalFormatWithUpdatedAt(activationCode) {
        const base = this.toCanonicalFormat(activationCode);
        return Object.assign(Object.assign({}, base), { updatedAt: activationCode.updatedAt.toISOString() });
    }
};
exports.ActivationCodeService = ActivationCodeService;
exports.ActivationCodeService = ActivationCodeService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], ActivationCodeService);
