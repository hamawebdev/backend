import { RefreshToken } from "@prisma/client";
import { inject, injectable } from "tsyringe";
import IRefreshTokenRepository from "./interfaces/IRefreshTokenRepository";
import PrismaService from "../../config/db";

@injectable()
export default class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma() {
    return this.prismaService.getClient();
  }

  async create(
    userId: number,
    token: string,
    expiresAt: Date,
    deviceFingerprint?: string
  ): Promise<RefreshToken> {
    try {
      // Delete any existing refresh token for this user first
      await this.deleteByUserId(userId);

      return await this.prisma.refreshToken.create({
        data: {
          userId,
          token,
          expiresAt,
          deviceFingerprint,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async findByUserId(userId: number): Promise<RefreshToken | null> {
    try {
      return await this.prisma.refreshToken.findFirst({
        where: { userId },
      });
    } catch (error) {
      throw error;
    }
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    try {
      return await this.prisma.refreshToken.findUnique({
        where: { token },
      });
    } catch (error) {
      throw error;
    }
  }

  async updateByUserId(
    userId: number,
    token: string,
    expiresAt: Date,
    deviceFingerprint?: string
  ): Promise<RefreshToken> {
    try {
      // First find the existing token for this user
      const existingToken = await this.findByUserId(userId);
      if (!existingToken) {
        // If no existing token, create a new one
        return await this.create(userId, token, expiresAt, deviceFingerprint);
      }

      // Update using the token as unique identifier
      return await this.prisma.refreshToken.update({
        where: { token: existingToken.token },
        data: {
          token,
          expiresAt,
          deviceFingerprint,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async deleteByUserId(userId: number): Promise<void> {
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    } catch (error) {
      throw error;
    }
  }

  async deleteByToken(token: string): Promise<void> {
    try {
      await this.prisma.refreshToken.delete({
        where: { token },
      });
    } catch (error) {
      throw error;
    }
  }

  async deleteExpiredTokens(): Promise<void> {
    try {
      await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
}
