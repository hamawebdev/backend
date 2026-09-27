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
        // Claim one use of the code atomically. The row update is serialized by
        // Postgres, so concurrent redeems cannot push currentUses past maxUses.
        const claimed = await tx.activationCode.updateMany({
          where: {
            id: validation.code!.id,
            isActive: true,
            expiresAt: { gt: new Date() },
            currentUses: { lt: validation.code!.maxUses }
          },
          data: {
            currentUses: {
              increment: 1
            }
          }
        });
        if (claimed.count === 0) {
          throw new AppError("Activation code has reached its usage limit", 400);
        }

        // Grant each study pack on the code: create a subscription, or extend the
        // user's current one for that pack so a renewal never wastes the code
        const subscriptions = [];
        const now = new Date();

        // Add the code's duration to a start date
        const durationType = validation.code!.durationType || 'MONTHS';
        const addCodeDuration = (from: Date): Date => {
          const end = new Date(from);
          if (durationType === 'DAYS' && validation.code!.durationDays) {
            end.setDate(end.getDate() + validation.code!.durationDays);
          } else {
            end.setMonth(end.getMonth() + validation.code!.durationMonths);
          }
          return end;
        };

        for (const studyPack of validation.studyPacks!) {
          // Check if user already has an active subscription to this study pack
          const existingSubscription = await tx.subscription.findFirst({
            where: {
              userId: userId,
              studyPackId: studyPack.id,
              status: 'ACTIVE',
              endDate: {
                gt: now
              }
            },
            orderBy: { endDate: 'desc' }
          });

          if (existingSubscription) {
            // Extend from the current (future) end date, so the remaining days are kept
            const subscription = await tx.subscription.update({
              where: { id: existingSubscription.id },
              data: {
                endDate: addCodeDuration(existingSubscription.endDate)
              },
              include: {
                studyPack: true
              }
            });
            subscriptions.push(subscription);
          } else {
            const subscription = await tx.subscription.create({
              data: {
                userId: userId,
                studyPackId: studyPack.id,
                status: 'ACTIVE',
                startDate: now,
                endDate: addCodeDuration(now),
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

        // Create redemption record. (activationCodeId, userId) is unique, so a
        // concurrent second redeem by the same user fails here and rolls back.
        const redemption = await tx.codeRedemption.create({
          data: {
            activationCodeId: validation.code!.id,
            userId: userId,
            subscriptionId: subscriptions.length > 0 ? subscriptions[0].id : null
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

    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error?.code === 'P2002') {
        throw new AppError("You have already redeemed this activation code", 400);
      }
      console.error("Error redeeming activation code:", error);
      throw new AppError("Failed to redeem activation code", 500);
    }
  }
}
