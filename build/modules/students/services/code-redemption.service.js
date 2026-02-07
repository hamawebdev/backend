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
exports.CodeRedemptionService = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../../../core/errors/AppError");
const db_1 = __importDefault(require("../../../config/db"));
let CodeRedemptionService = class CodeRedemptionService {
    constructor(prismaService) {
        this.prismaService = prismaService;
        this.prisma = this.prismaService.getClient();
    }
    /**
     * Validate an activation code
     * @param code The activation code to validate
     * @returns Validation result with code details
     */
    validateActivationCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Find the activation code with all related data
                const activationCode = yield this.prisma.activationCode.findUnique({
                    where: { code: code.toUpperCase().trim() },
                    include: {
                        studyPacks: {
                            include: {
                                studyPack: {
                                    select: {
                                        id: true,
                                        name: true,
                                        description: true,
                                        type: true,
                                        yearNumber: true,
                                        pricePerMonth: true,
                                        pricePerYear: true,
                                        isActive: true
                                    }
                                }
                            }
                        },
                        redemptions: {
                            select: {
                                id: true,
                                userId: true,
                                redeemedAt: true
                            }
                        }
                    }
                });
                // Check if code exists
                if (!activationCode) {
                    return {
                        isValid: false,
                        message: "Invalid activation code"
                    };
                }
                // Check if code is active
                if (!activationCode.isActive) {
                    return {
                        isValid: false,
                        message: "Activation code has been deactivated"
                    };
                }
                // Check if code has expired
                if (new Date() > activationCode.expiresAt) {
                    return {
                        isValid: false,
                        message: "Activation code has expired"
                    };
                }
                // Check usage limits
                if (activationCode.currentUses >= activationCode.maxUses) {
                    return {
                        isValid: false,
                        message: "Activation code has reached its usage limit"
                    };
                }
                // Check if any study packs are available
                const activeStudyPacks = activationCode.studyPacks.filter(sp => sp.studyPack.isActive);
                if (activeStudyPacks.length === 0) {
                    return {
                        isValid: false,
                        message: "No active study packs are associated with this code"
                    };
                }
                return {
                    isValid: true,
                    code: {
                        id: activationCode.id,
                        code: activationCode.code,
                        description: activationCode.description,
                        durationType: activationCode.durationType || 'MONTHS',
                        durationMonths: activationCode.durationMonths,
                        durationDays: activationCode.durationDays,
                        maxUses: activationCode.maxUses,
                        currentUses: activationCode.currentUses,
                        expiresAt: activationCode.expiresAt
                    },
                    studyPacks: activeStudyPacks.map(sp => sp.studyPack),
                    message: "Activation code is valid"
                };
            }
            catch (error) {
                console.error("Error validating activation code:", error);
                throw new AppError_1.AppError("Failed to validate activation code", 500);
            }
        });
    }
    /**
     * Redeem an activation code for a user
     * @param code The activation code to redeem
     * @param userId The user ID redeeming the code
     * @returns Redemption result with created subscriptions
     */
    redeemActivationCode(code, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First validate the code
                const validation = yield this.validateActivationCode(code);
                if (!validation.isValid) {
                    throw new AppError_1.AppError(validation.message || "Invalid activation code", 400);
                }
                // Check if user has already redeemed this code
                const existingRedemption = yield this.prisma.codeRedemption.findFirst({
                    where: {
                        activationCodeId: validation.code.id,
                        userId: userId
                    }
                });
                if (existingRedemption) {
                    throw new AppError_1.AppError("You have already redeemed this activation code", 400);
                }
                // Start transaction for redemption
                const result = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // Create subscriptions for each study pack
                    const subscriptions = [];
                    const startDate = new Date();
                    const endDate = new Date();
                    // Calculate endDate based on durationType
                    const durationType = validation.code.durationType || 'MONTHS';
                    if (durationType === 'DAYS' && validation.code.durationDays) {
                        endDate.setDate(endDate.getDate() + validation.code.durationDays);
                    }
                    else {
                        endDate.setMonth(endDate.getMonth() + validation.code.durationMonths);
                    }
                    for (const studyPack of validation.studyPacks) {
                        // Check if user already has an active subscription to this study pack
                        const existingSubscription = yield tx.subscription.findFirst({
                            where: {
                                userId: userId,
                                studyPackId: studyPack.id,
                                status: 'ACTIVE',
                                endDate: {
                                    gte: new Date()
                                }
                            }
                        });
                        if (!existingSubscription) {
                            const subscription = yield tx.subscription.create({
                                data: {
                                    userId: userId,
                                    studyPackId: studyPack.id,
                                    status: 'ACTIVE',
                                    startDate: startDate,
                                    endDate: endDate,
                                    amountPaid: 0, // Free through activation code
                                    paymentMethod: 'ACTIVATION_CODE',
                                    paymentReference: validation.code.code
                                },
                                include: {
                                    studyPack: true
                                }
                            });
                            subscriptions.push(subscription);
                        }
                    }
                    // Create redemption record
                    const redemption = yield tx.codeRedemption.create({
                        data: {
                            activationCodeId: validation.code.id,
                            userId: userId,
                            subscriptionId: subscriptions.length > 0 ? subscriptions[0].id : null
                        }
                    });
                    // Update activation code usage count
                    yield tx.activationCode.update({
                        where: { id: validation.code.id },
                        data: {
                            currentUses: {
                                increment: 1
                            }
                        }
                    });
                    return {
                        redemption,
                        subscriptions,
                        activationCode: validation.code
                    };
                }));
                return {
                    success: true,
                    message: "Activation code redeemed successfully",
                    data: {
                        subscriptions: result.subscriptions,
                        redemption: result.redemption,
                        activationCode: result.activationCode
                    }
                };
            }
            catch (error) {
                if (error instanceof AppError_1.AppError) {
                    throw error;
                }
                console.error("Error redeeming activation code:", error);
                throw new AppError_1.AppError("Failed to redeem activation code", 500);
            }
        });
    }
};
exports.CodeRedemptionService = CodeRedemptionService;
exports.CodeRedemptionService = CodeRedemptionService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], CodeRedemptionService);
