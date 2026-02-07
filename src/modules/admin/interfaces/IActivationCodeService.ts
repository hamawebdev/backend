import { ActivationCode } from "@prisma/client";

// Canonical DTO interfaces
export interface CreateActivationCodeDto {
  code: string;
  studyPackId: number;
  expiryDate?: string;
  maxUses?: number;
  durationMonths?: number;
  isActive?: boolean;
}

export interface UpdateActivationCodeDto {
  code?: string;
  studyPackId?: number;
  expiryDate?: string;
  maxUses?: number;
  durationMonths?: number;
  isActive?: boolean;
}

export interface ActivationCodeFilters {
  isActive?: boolean;
  search?: string;
  studyPackId?: number;
  expiryDate?: string;
}

export interface CanonicalActivationCode {
  id: number;
  code: string;
  studyPackId: number | null;
  studyPack: {
    id: number;
    name: string;
    type?: string;
  } | null;
  expiryDate: string | null;
  maxUses: number;
  currentUses: number;
  durationMonths: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  usageHistory?: {
    userId: number;
    userName: string;
    redeemedAt: string;
  }[];
}

export interface PaginatedActivationCodes {
  items: CanonicalActivationCode[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DeactivateResponse {
  id: number;
  code: string;
  isActive: boolean;
  deactivatedAt: string;
}

export interface IActivationCodeService {
  /**
   * Create a new activation code
   * POST /admin/activation-codes
   */
  createActivationCode(data: CreateActivationCodeDto, createdById: number): Promise<CanonicalActivationCode>;

  /**
   * Get all activation codes with filtering and pagination
   * GET /admin/activation-codes
   */
  getAllActivationCodes(
    filters: ActivationCodeFilters,
    page?: number,
    limit?: number
  ): Promise<PaginatedActivationCodes>;

  /**
   * Get activation code by ID with usage history
   * GET /admin/activation-codes/:id
   */
  getActivationCodeById(id: number): Promise<CanonicalActivationCode>;

  /**
   * Update activation code
   * PUT /admin/activation-codes/:id
   */
  updateActivationCode(id: number, data: UpdateActivationCodeDto): Promise<CanonicalActivationCode>;

  /**
   * Delete activation code
   * DELETE /admin/activation-codes/:id
   */
  deleteActivationCode(id: number): Promise<{ message: string }>;

  /**
   * Deactivate an activation code
   * PATCH /admin/activation-codes/:id/deactivate
   */
  deactivateActivationCode(id: number): Promise<DeactivateResponse>;
}
