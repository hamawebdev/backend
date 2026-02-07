import { RefreshToken } from "@prisma/client";

export default interface IRefreshTokenRepository {
  create(userId: number, token: string, expiresAt: Date, deviceFingerprint?: string): Promise<RefreshToken>;
  findByUserId(userId: number): Promise<RefreshToken | null>;
  findByToken(token: string): Promise<RefreshToken | null>;
  updateByUserId(userId: number, token: string, expiresAt: Date, deviceFingerprint?: string): Promise<RefreshToken>;
  deleteByUserId(userId: number): Promise<void>;
  deleteByToken(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;
}
