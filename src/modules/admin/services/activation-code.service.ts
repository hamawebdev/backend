import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";
import { inject, injectable } from "tsyringe";
import { AppError, NotFoundError, BadRequestError, ConflictError } from "../../../core/errors/AppError";
import { IActivationCodeService } from "../interfaces/IActivationCodeService";
import { ActivationCode } from "@prisma/client";
import PrismaService from "../../../config/db";

// Canonical DTO interfaces
interface CreateActivationCodeData {
  code?: string;  // Optional - will be auto-generated if not provided
  description?: string;
  studyPackId?: number;  // Legacy single study pack
  studyPackIds?: number[];  // New format: multiple study packs
  expiryDate?: string;  // Legacy field
  expiresAt?: string;  // New field name
  maxUses?: number;
  durationType?: 'MONTHS' | 'DAYS';
  durationMonths?: number;
  durationDays?: number;
  isActive?: boolean;
}

// Helper to generate random activation code (CSPRNG: codes grant paid access)
function generateActivationCode(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  // Add dashes for readability (e.g., XXXX-XXXX-XXXX)
  return code.match(/.{1,4}/g)?.join('-') || code;
}

interface UpdateActivationCodeData {
  code?: string;
  description?: string | null;
  studyPackId?: number;  // Legacy single study pack (replaces the code's packs)
  studyPackIds?: number[];  // Replaces the code's packs
  expiryDate?: string;  // Legacy field
  expiresAt?: string;
  maxUses?: number;
  durationType?: 'MONTHS' | 'DAYS';
  durationMonths?: number;
  durationDays?: number;
  isActive?: boolean;
}

interface ActivationCodeFilters {
  isActive?: boolean;
  search?: string;
  studyPackId?: number;
  expiryDate?: string;
}

@injectable()
export class ActivationCodeService implements IActivationCodeService {
  private prisma: PrismaClient;

  constructor(
    @inject("db") private prismaService: PrismaService
  ) {
    this.prisma = this.prismaService.getClient();
  }

  /**
   * Create a new activation code (Canonical spec)
   * POST /admin/activation-codes
   * Supports: auto-generated code, multiple study packs, duration types (MONTHS/DAYS)
   */
  async createActivationCode(data: CreateActivationCodeData, createdById: number): Promise<any> {
    // Generate code if not provided
    let code = data.code;
    if (!code) {
      code = generateActivationCode();
      // Ensure uniqueness
      let attempts = 0;
      while (attempts < 10) {
        const existingCode = await this.prisma.activationCode.findUnique({
          where: { code }
        });
        if (!existingCode) break;
        code = generateActivationCode();
        attempts++;
      }
      if (attempts >= 10) {
        throw new BadRequestError("Failed to generate unique activation code. Please try again.");
      }
    } else {
      // Check if provided code already exists
      const existingCode = await this.prisma.activationCode.findUnique({
        where: { code }
      });
      if (existingCode) {
        throw new BadRequestError("Activation code already exists");
      }
    }

    // Get study pack IDs - support both single and array formats
    const studyPackIds: number[] = [];
    if (data.studyPackIds && data.studyPackIds.length > 0) {
      studyPackIds.push(...data.studyPackIds);
    } else if (data.studyPackId) {
      studyPackIds.push(data.studyPackId);
    }

    if (studyPackIds.length === 0) {
      throw new BadRequestError("At least one study pack must be specified");
    }

    // Verify all study packs exist
    const existingStudyPacks = await this.prisma.studyPack.findMany({
      where: { id: { in: studyPackIds } }
    });

    if (existingStudyPacks.length !== studyPackIds.length) {
      const foundIds = existingStudyPacks.map(sp => sp.id);
      const missingIds = studyPackIds.filter(id => !foundIds.includes(id));
      throw new NotFoundError(`Study pack(s) not found: ${missingIds.join(', ')}`);
    }

    // Handle duration based on type - store both fields correctly
    const durationType = data.durationType || 'MONTHS';
    let durationMonths = 1; // Default for MONTHS type
    let durationDays: number | null = null;

    if (durationType === 'DAYS' && data.durationDays) {
      durationDays = data.durationDays;
      durationMonths = 1; // Minimum value to satisfy schema, not used for DAYS type
    } else if (durationType === 'MONTHS') {
      durationMonths = data.durationMonths || 1;
    }

    // Get expiry date - support both field names
    const expiryDate = data.expiresAt || data.expiryDate;
    const expiresAt = expiryDate
      ? new Date(expiryDate)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

    // Create the activation code with all study pack relations
    const activationCode = await this.prisma.activationCode.create({
      data: {
        code: code,
        hashedCode: code, // Simplified - in production use proper hashing
        description: data.description,
        durationType: durationType,
        durationMonths: durationMonths,
        durationDays: durationDays,
        maxUses: data.maxUses || 100,
        currentUses: 0,
        isActive: data.isActive ?? true,
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
  }

  /**
   * Get all activation codes with filtering and pagination (Canonical spec)
   * GET /admin/activation-codes
   */
  async getAllActivationCodes(
    filters: ActivationCodeFilters,
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {};

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

    const [activationCodes, total] = await Promise.all([
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
  }

  /**
   * Get activation code by ID with usage history (Canonical spec)
   * GET /admin/activation-codes/:id
   */
  async getActivationCodeById(id: number): Promise<any> {
    const activationCode = await this.prisma.activationCode.findUnique({
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
      throw new NotFoundError("Activation code not found");
    }

    // Build usage history
    const usageHistory = activationCode.redemptions.map(redemption => ({
      userId: redemption.user.id,
      userName: redemption.user.fullName,
      redeemedAt: redemption.redeemedAt.toISOString()
    }));

    const result = this.toCanonicalFormat(activationCode);
    return {
      ...result,
      usageHistory
    };
  }

  /**
   * Update activation code (Canonical spec)
   * PUT /admin/activation-codes/:id
   */
  async updateActivationCode(id: number, data: UpdateActivationCodeData): Promise<any> {
    const existingCode = await this.prisma.activationCode.findUnique({
      where: { id }
    });

    if (!existingCode) {
      throw new NotFoundError("Activation code not found");
    }

    // Check if new code conflicts with existing
    if (data.code && data.code !== existingCode.code) {
      const codeConflict = await this.prisma.activationCode.findUnique({
        where: { code: data.code }
      });
      if (codeConflict) {
        throw new BadRequestError("Activation code already exists");
      }
    }

    // New study packs (studyPackIds, or the legacy single studyPackId) replace the current ones
    const studyPackIds = data.studyPackIds && data.studyPackIds.length > 0
      ? Array.from(new Set(data.studyPackIds))
      : (data.studyPackId ? [data.studyPackId] : undefined);
    if (studyPackIds) {
      const found = await this.prisma.studyPack.findMany({
        where: { id: { in: studyPackIds } },
        select: { id: true }
      });
      if (found.length !== studyPackIds.length) {
        const foundIds = found.map(pack => pack.id);
        const missingIds = studyPackIds.filter(packId => !foundIds.includes(packId));
        throw new NotFoundError(`Study pack(s) not found: ${missingIds.join(', ')}`);
      }
    }

    // Build update data
    const updateData: any = {};
    if (data.code !== undefined) {
      updateData.code = data.code;
      updateData.hashedCode = data.code;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    const expiryDate = data.expiresAt ?? data.expiryDate;
    if (expiryDate !== undefined) {
      updateData.expiresAt = new Date(expiryDate);
    }
    if (data.maxUses !== undefined) {
      updateData.maxUses = data.maxUses;
    }

    // Duration: same rules as create (DAYS needs durationDays; durationMonths stays >= 1)
    const durationType = data.durationType ?? (existingCode.durationType as 'MONTHS' | 'DAYS');
    if (data.durationType !== undefined) {
      updateData.durationType = data.durationType;
    }
    if (durationType === 'DAYS') {
      const durationDays = data.durationDays ?? existingCode.durationDays;
      if (!durationDays) {
        throw new BadRequestError("durationDays is required when durationType is DAYS");
      }
      updateData.durationDays = durationDays;
    } else {
      if (data.durationMonths !== undefined) {
        updateData.durationMonths = data.durationMonths;
      }
      if (data.durationType === 'MONTHS') {
        updateData.durationDays = null;
      }
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    // Update the code and, when given, its study packs together
    const updatedCode = await this.prisma.$transaction(async (tx) => {
      await tx.activationCode.update({
        where: { id },
        data: updateData
      });

      if (studyPackIds) {
        await tx.activationCodeStudyPack.deleteMany({
          where: { activationCodeId: id }
        });
        await tx.activationCodeStudyPack.createMany({
          data: studyPackIds.map(studyPackId => ({ activationCodeId: id, studyPackId }))
        });
      }

      return tx.activationCode.findUnique({
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
    });

    return this.toCanonicalFormatWithUpdatedAt(updatedCode!);
  }

  /**
   * Delete activation code (Canonical spec)
   * DELETE /admin/activation-codes/:id
   */
  async deleteActivationCode(id: number): Promise<{ message: string }> {
    const activationCode = await this.prisma.activationCode.findUnique({
      where: { id }
    });

    if (!activationCode) {
      throw new NotFoundError("Activation code not found");
    }

    // Deleting a redeemed code would cascade away its redemption history
    const redemptions = await this.prisma.codeRedemption.count({ where: { activationCodeId: id } });
    if (redemptions > 0) {
      throw new ConflictError(
        `Cannot delete activation code ${activationCode.code}: it has been redeemed ${redemptions} time(s). Deactivate it instead.`
      );
    }

    await this.prisma.activationCode.delete({
      where: { id }
    });

    return { message: "Activation code deleted successfully" };
  }

  /**
   * Deactivate an activation code (Canonical spec)
   * PATCH /admin/activation-codes/:id/deactivate
   */
  async deactivateActivationCode(id: number): Promise<any> {
    const activationCode = await this.prisma.activationCode.findUnique({
      where: { id }
    });

    if (!activationCode) {
      throw new NotFoundError("Activation code not found");
    }

    if (!activationCode.isActive) {
      throw new BadRequestError("Activation code is already deactivated");
    }

    const deactivatedCode = await this.prisma.activationCode.update({
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
  }

  /**
   * Transform activation code to canonical format
   * Supports both single studyPack (legacy) and multiple studyPacks (new format)
   */
  private toCanonicalFormat(activationCode: any): any {
    // Get all study packs
    const studyPacksList = activationCode.studyPacks?.map((sp: any) => ({
      id: sp.studyPack.id,
      name: sp.studyPack.name
    })) || [];

    // Legacy single study pack support
    const firstStudyPack = studyPacksList[0] || null;

    // Return duration fields based on durationType
    const durationType = activationCode.durationType || 'MONTHS';
    const durationFields = durationType === 'DAYS'
      ? { durationType, durationDays: activationCode.durationDays }
      : { durationType, durationMonths: activationCode.durationMonths };

    return {
      id: activationCode.id,
      code: activationCode.code,
      description: activationCode.description || null,
      // Legacy single study pack fields
      studyPackId: firstStudyPack?.id || null,
      studyPack: firstStudyPack,
      // New format: array of study packs
      studyPacks: studyPacksList,
      expiryDate: activationCode.expiresAt?.toISOString() || null,
      expiresAt: activationCode.expiresAt?.toISOString() || null,
      maxUses: activationCode.maxUses,
      currentUses: activationCode.currentUses,
      ...durationFields,
      isActive: activationCode.isActive,
      createdAt: activationCode.createdAt.toISOString()
    };
  }

  /**
   * Transform activation code to canonical format with updatedAt
   */
  private toCanonicalFormatWithUpdatedAt(activationCode: any): any {
    const base = this.toCanonicalFormat(activationCode);
    return {
      ...base,
      updatedAt: activationCode.updatedAt.toISOString()
    };
  }
}