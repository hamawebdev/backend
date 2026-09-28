import { PrismaClient } from "@prisma/client";
import { TransactionClient } from "../../../types/prisma.types";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../../core/errors/AppError";
import PrismaService from "../../../config/db";

// Why a code cannot be redeemed. Sent as error.code so the web app can show a
// message for each reason instead of one generic failure.
export const ACTIVATION_CODE_ERRORS = {
  NOT_FOUND: "ACTIVATION_CODE_NOT_FOUND",
  ALREADY_REDEEMED: "ACTIVATION_CODE_ALREADY_REDEEMED",
  DEACTIVATED: "ACTIVATION_CODE_DEACTIVATED",
  EXPIRED: "ACTIVATION_CODE_EXPIRED",
  USED_UP: "ACTIVATION_CODE_USED_UP",
  NO_ACTIVE_PACKS: "ACTIVATION_CODE_NO_ACTIVE_PACKS",
} as const;

type RedeemBlocker = keyof typeof ACTIVATION_CODE_ERRORS;

const BLOCKER_MESSAGES: Record<RedeemBlocker, string> = {
  NOT_FOUND: "Invalid activation code",
  ALREADY_REDEEMED: "You have already redeemed this activation code",
  DEACTIVATED: "Activation code has been deactivated",
  EXPIRED: "Activation code has expired",
  USED_UP: "Activation code has reached its usage limit",
  NO_ACTIVE_PACKS: "No active study packs are associated with this code",
};

function blockerError(blocker: RedeemBlocker): AppError {
  return new AppError(BLOCKER_MESSAGES[blocker], 400, undefined, ACTIVATION_CODE_ERRORS[blocker]);
}

/**
 * The first reason this student cannot redeem the code, or null when they can.
 * The student's own earlier redemption comes first: it is the most useful thing
 * to tell them, whatever state the code is in now.
 */
export function findRedeemBlocker(
  code: { isActive: boolean; expiresAt: Date; maxUses: number },
  state: { alreadyRedeemed: boolean; redemptions: number; activePacks: number },
  now: Date = new Date()
): RedeemBlocker | null {
  if (state.alreadyRedeemed) return "ALREADY_REDEEMED";
  if (!code.isActive) return "DEACTIVATED";
  if (code.expiresAt <= now) return "EXPIRED";
  if (state.redemptions >= code.maxUses) return "USED_UP";
  if (state.activePacks === 0) return "NO_ACTIVE_PACKS";
  return null;
}

// Codes are stored upper-case (see the admin validation)
const normalizeCode = (code: string) => code.trim().toUpperCase();

const codeWithPacks = {
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
  }
} as const;

@injectable()
export class CodeRedemptionService {
  private prisma: PrismaClient;

  constructor(
    @inject("db") private prismaService: PrismaService
  ) {
    this.prisma = this.prismaService.getClient();
  }

  /**
   * Check whether a student can redeem a code, without redeeming it.
   * Throws an AppError whose code says why not (ACTIVATION_CODE_ERRORS).
   */
  async validateActivationCode(code: string, userId: number) {
    const activationCode = await this.prisma.activationCode.findUnique({
      where: { code: normalizeCode(code) },
      include: codeWithPacks
    });
    if (!activationCode) {
      throw blockerError("NOT_FOUND");
    }

    const [ownRedemptions, redemptions] = await Promise.all([
      this.prisma.codeRedemption.count({ where: { activationCodeId: activationCode.id, userId } }),
      this.prisma.codeRedemption.count({ where: { activationCodeId: activationCode.id } })
    ]);
    const activeStudyPacks = activationCode.studyPacks.map(sp => sp.studyPack).filter(pack => pack.isActive);

    const blocker = findRedeemBlocker(activationCode, {
      alreadyRedeemed: ownRedemptions > 0,
      redemptions,
      activePacks: activeStudyPacks.length
    });
    if (blocker) {
      throw blockerError(blocker);
    }

    return {
      code: this.codeSummary(activationCode, redemptions),
      studyPacks: activeStudyPacks,
      message: "Activation code is valid"
    };
  }

  /**
   * Redeem an activation code for a student: grant (or extend) each active study
   * pack on the code and record the redemption, all in one transaction. Any
   * failure leaves nothing changed.
   */
  async redeemActivationCode(code: string, userId: number) {
    try {
      const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Lock the code's row until commit. Redemptions of the same code (and admin
        // edits of it) then run one after the other, and each one counts the
        // redemptions committed before it, so the limit can never be passed.
        const locked = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM activation_codes WHERE code = ${normalizeCode(code)} FOR UPDATE`;
        if (locked.length === 0) {
          throw blockerError("NOT_FOUND");
        }
        const codeId = locked[0].id;

        // One redemption at a time per student, so two codes for the same pack
        // redeemed at once extend one subscription instead of creating two
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;

        const activationCode = await tx.activationCode.findUniqueOrThrow({
          where: { id: codeId },
          include: codeWithPacks
        });
        const ownRedemptions = await tx.codeRedemption.count({ where: { activationCodeId: codeId, userId } });
        const redemptions = await tx.codeRedemption.count({ where: { activationCodeId: codeId } });
        const activeStudyPacks = activationCode.studyPacks.map(sp => sp.studyPack).filter(pack => pack.isActive);

        const now = new Date();
        const blocker = findRedeemBlocker(activationCode, {
          alreadyRedeemed: ownRedemptions > 0,
          redemptions,
          activePacks: activeStudyPacks.length
        }, now);
        if (blocker) {
          throw blockerError(blocker);
        }

        // Add the code's duration to a start date
        const durationType = activationCode.durationType || 'MONTHS';
        const addCodeDuration = (from: Date): Date => {
          const end = new Date(from);
          if (durationType === 'DAYS' && activationCode.durationDays) {
            end.setDate(end.getDate() + activationCode.durationDays);
          } else {
            end.setMonth(end.getMonth() + activationCode.durationMonths);
          }
          return end;
        };

        // Grant each study pack on the code: create a subscription, or extend the
        // user's current one for that pack so a renewal never wastes the code
        const subscriptions = [];
        for (const studyPack of activeStudyPacks) {
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
                paymentReference: activationCode.code
              },
              include: {
                studyPack: true
              }
            });
            subscriptions.push(subscription);
          }
        }

        const redemption = await tx.codeRedemption.create({
          data: {
            activationCodeId: codeId,
            userId: userId,
            subscriptionId: subscriptions.length > 0 ? subscriptions[0].id : null
          }
        });

        // current_uses mirrors the number of redemption rows
        await tx.activationCode.update({
          where: { id: codeId },
          data: { currentUses: redemptions + 1 }
        });

        return {
          redemption,
          subscriptions,
          activationCode: this.codeSummary(activationCode, redemptions + 1)
        };
      }, {
        // A burst of redemptions of one code queues on its row lock
        maxWait: 10000,
        timeout: 20000
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
      // (activationCodeId, userId) is unique; the row lock makes this unreachable,
      // but a duplicate still means the student already redeemed the code
      if (error?.code === 'P2002') {
        throw blockerError("ALREADY_REDEEMED");
      }
      console.error("Error redeeming activation code:", error);
      throw new AppError("Failed to redeem activation code", 500);
    }
  }

  private codeSummary(activationCode: any, redemptions: number) {
    return {
      id: activationCode.id,
      code: activationCode.code,
      description: activationCode.description,
      durationType: activationCode.durationType || 'MONTHS',
      durationMonths: activationCode.durationMonths,
      durationDays: activationCode.durationDays,
      maxUses: activationCode.maxUses,
      currentUses: redemptions,
      expiresAt: activationCode.expiresAt
    };
  }
}
