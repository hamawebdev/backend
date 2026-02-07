import { PrismaClient } from "@prisma/client";
import { TransactionClient } from "../../../types/prisma.types";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../../core/errors/AppError";
import PrismaService from "../../../config/db";

interface CodeValidationResult {
  isValid: boolean;
  code?: any;
  studyPacks?: any[];
  message?: string;
}

@injectable()
export class CodeRedemptionService {
  private prisma: PrismaClient;

  constructor(
    @inject("db") private prismaService: PrismaService
  ) {
    this.prisma = this.prismaService.getClient();
  }

  /**
   * Validate an activation code
   * @param code The activation code to validate
   * @returns Validation result with code details
   */
  async validateActivationCode(code: string): Promise<CodeValidationResult> {
    try {
      // Find the activation code with all related data
      const activationCode = await this.prisma.activationCode.findUnique({
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
      const activeStudyPacks = activationCode.studyPacks.filter(
        sp => sp.studyPack.isActive
      );

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

    } catch (error) {
      console.error("Error validating activation code:", error);
      throw new AppError("Failed to validate activation code", 500);
    }
  }

  /**
   * Redeem an activation code for a user
   * @param code The activation code to redeem
   * @param userId The user ID redeeming the code
   * @returns Redemption result with created subscriptions
   */
  async redeemActivationCode(code: string, userId: number) {
    try {
      // First validate the code
      const validation = await this.validateActivationCode(code);

      if (!validation.isValid) {
        throw new AppError(validation.message || "Invalid activation code", 400);
      }

      // Check if user has already redeemed this code
      const existingRedemption = await this.prisma.codeRedemption.findFirst({
        where: {
          activationCodeId: validation.code!.id,
          userId: userId
        }
      });

      if (existingRedemption) {
        throw new AppError("You have already redeemed this activation code", 400);
      }

      // Start transaction for redemption
      const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Create subscriptions for each study pack
        const subscriptions = [];
        const startDate = new Date();
        const endDate = new Date();

        // Calculate endDate based on durationType
        const durationType = validation.code!.durationType || 'MONTHS';
        if (durationType === 'DAYS' && validation.code!.durationDays) {
          endDate.setDate(endDate.getDate() + validation.code!.durationDays);
        } else {
          endDate.setMonth(endDate.getMonth() + validation.code!.durationMonths);
        }

        for (const studyPack of validation.studyPacks!) {
          // Check if user already has an active subscription to this study pack
          const existingSubscription = await tx.subscription.findFirst({
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
            const subscription = await tx.subscription.create({
              data: {
                userId: userId,
                studyPackId: studyPack.id,
                status: 'ACTIVE',
                startDate: startDate,
                endDate: endDate,
                amountPaid: 0, // Free through activation code
                paymentMethod: 'ACTIVATION_CODE',
                paymentReference: validation.code!.code
              },
              include: {
                studyPack: true
              }
            });
            subscriptions.push(subscription);
          }
        }

        // Create redemption record
        const redemption = await tx.codeRedemption.create({
          data: {
            activationCodeId: validation.code!.id,
            userId: userId,
            subscriptionId: subscriptions.length > 0 ? subscriptions[0].id : null
          }
        });

        // Update activation code usage count
        await tx.activationCode.update({
          where: { id: validation.code!.id },
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
      });

      return {
        success: true,
        message: "Activation code redeemed successfully",
        data: {
          subscriptions: result.subscriptions,
          redemption: result.redemption,
          activationCode: result.activationCode
        }
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error("Error redeeming activation code:", error);
      throw new AppError("Failed to redeem activation code", 500);
    }
  }
}
