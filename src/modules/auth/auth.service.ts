import { inject, injectable } from "tsyringe";
import bcrypt from "bcrypt";
import IAuthService from "./interfaces/IAuthService";
import IUserRepository from "../users/interfaces/IUserRepository";
import IRefreshTokenRepository from "./interfaces/IRefreshTokenRepository";
import JwtUtils from "../../core/utils/jwt.utils";
import {
  TAuthToken,
  TJwtPayload,
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto
} from "../../types/types";
import {
  AppError,
  ConflictError,
  NotFoundError,
  InternalServerError,
  UnauthorizedError,
  BadRequestError,
} from "../../core/errors/AppError";
import { Prisma, User } from "@prisma/client";
import { buildJwtPayload } from "./jwt-payload.builder";

@injectable()
export default class AuthService implements IAuthService {
  constructor(
    @inject("IUserRepository") private userRepository: IUserRepository,
    @inject("IRefreshTokenRepository") private refreshTokenRepository: IRefreshTokenRepository,
    @inject("jwt") private jwt: JwtUtils,
  ) { }

  async register(userData: RegisterDto & { deviceFingerprint?: string }): Promise<TAuthToken> {
    try {
      const existingUser = await this.userRepository.findByEmail(userData.email);
      if (existingUser) throw new ConflictError("User already exists");

      const passwordHash = await bcrypt.hash(userData.password, 10);

      const user = await this.userRepository.createUser({
        email: userData.email,
        passwordHash,
        fullName: userData.fullName,
        universityId: userData.universityId,
        specialtyId: userData.specialtyId,
        currentYear: userData.currentYear,
      });

      // Generate email verification token
      const emailVerificationToken = this.jwt.generateEmailVerificationToken(user.id, user.email);

      // TODO: Send email verification email (no mail provider yet).
      // Never write the token to production logs.
      if (process.env.NODE_ENV === "development") {
        console.log(`Email verification token for ${user.email}: ${emailVerificationToken}`);
      }

      const deviceFingerprint = userData.deviceFingerprint || 'unknown';
      const jwtPayload = await this.buildJwtPayload(user);
      const accessToken = this.jwt.generateAccessToken(jwtPayload);
      const refreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 25);

      await this.refreshTokenRepository.create(
        user.id,
        refreshToken,
        expiresAt,
        deviceFingerprint,
      );

      return { accessToken, refreshToken };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      mapUserWriteError(error);
      throw new InternalServerError("Failed to register user");
    }
  }

  async login(loginData: LoginDto & { deviceFingerprint?: string }): Promise<TAuthToken> {
    try {
      // Validate input
      if (!loginData.email || !loginData.password) {
        throw new BadRequestError("Email and password are required");
      }

      const user = await this.userRepository.findByEmail(loginData.email);
      if (!user) {
        throw new UnauthorizedError("Invalid email or password. Please check your credentials and try again.");
      }

      if (!user.isActive) {
        throw new UnauthorizedError("Your account has been deactivated. Please contact support for assistance.");
      }

      // Email verification check disabled - users can login without verifying email
      // if (!user.emailVerified) {
      //   throw new UnauthorizedError("Please verify your email address before logging in. Check your inbox for the verification link.");
      // }

      // Check if user has a password (OAuth users might not have one)
      if (!user.passwordHash) {
        throw new UnauthorizedError("This account uses Google Sign-In. Please use the 'Continue with Google' button.");
      }

      const isPasswordValid = await bcrypt.compare(
        loginData.password,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedError("Invalid email or password. Please check your credentials and try again.");
      }

      // Update last login
      await this.userRepository.updateLastLogin(user.id);

      // Single device: a new login ends the access tokens of any other session
      // (refreshTokenRepository.create below also drops their refresh tokens)
      const tokenVersion = await this.userRepository.revokeAccessTokens(user.id);

      const deviceFingerprint = loginData.deviceFingerprint || 'unknown';
      const jwtPayload = await this.buildJwtPayload({ ...user, tokenVersion });
      const accessToken = this.jwt.generateAccessToken(jwtPayload);
      const refreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 25);

      await this.refreshTokenRepository.create(
        user.id,
        refreshToken,
        expiresAt,
        deviceFingerprint,
      );

      return { accessToken, refreshToken };
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof BadRequestError) {
        throw error;
      }
      console.error("Login error:", error);
      throw new InternalServerError("We're experiencing technical difficulties. Please try again later.");
    }
  }

  async refreshTokens(refreshToken: string): Promise<TAuthToken> {
    try {
      if (!refreshToken) {
        throw new BadRequestError("Refresh token is required");
      }

      // Verify JWT and extract payload (userId + deviceFingerprint)
      let userId: number;
      let deviceFingerprint: string;
      try {
        const payload = this.jwt.getRefreshTokenPayload(refreshToken);
        userId = payload.userId;
        deviceFingerprint = payload.deviceFingerprint;
      } catch (error) {
        console.error("[refreshTokens] JWT verification failed for refresh token:", (error as Error).message);
        throw error;
      }

      // Look up by token directly (uses unique index) for reliable matching
      const storedRefreshToken =
        await this.refreshTokenRepository.findByToken(refreshToken);

      if (!storedRefreshToken) {
        console.error("[refreshTokens] Token not found in DB for userId:", userId, "— may have been replaced by another login");
        throw new UnauthorizedError("Session expired. You may have logged in on another device. Please log in again.");
      }

      // Verify the token belongs to the expected user
      if (storedRefreshToken.userId !== userId) {
        console.error("[refreshTokens] Token userId mismatch:", { tokenUserId: storedRefreshToken.userId, jwtUserId: userId });
        throw new UnauthorizedError("Invalid refresh token. Please log in again.");
      }

      if (storedRefreshToken.expiresAt < new Date()) {
        throw new UnauthorizedError("Refresh token has expired. Please log in again.");
      }

      // Validate device fingerprint for single-device enforcement
      if (storedRefreshToken.deviceFingerprint &&
        storedRefreshToken.deviceFingerprint !== deviceFingerprint) {
        throw new UnauthorizedError("Session invalidated. You've logged in on another device. Please log in again.");
      }

      // Re-query user with subscriptions to get fresh subscription status
      const user = await this.userRepository.findByIdWithSubscriptions(userId);
      if (!user) {
        throw new UnauthorizedError("User account not found. Please contact support.");
      }

      if (!user.isActive) {
        throw new UnauthorizedError("Your account has been deactivated. Please contact support for assistance.");
      }

      // Rebuild JWT payload with fresh subscription data from database
      const jwtPayload = await this.buildJwtPayload(user);
      const newAccessToken = this.jwt.generateAccessToken(jwtPayload);
      const newRefreshToken = this.jwt.generateRefreshToken(user.id, user.email, deviceFingerprint);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 25);

      // Rotate only if the presented token is still the stored one: a concurrent
      // refresh with the same token (e.g. a second tab) gets a clean 401, not a 500
      const rotated = await this.refreshTokenRepository.rotate(
        refreshToken,
        newRefreshToken,
        expiresAt,
        deviceFingerprint,
      );
      if (!rotated) {
        throw new UnauthorizedError("Session expired. You may have logged in on another device. Please log in again.");
      }

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof BadRequestError
      ) {
        throw error;
      }
      console.error("Token refresh error:", error);
      throw new InternalServerError("We're experiencing technical difficulties. Please try again later.");
    }
  }

  async logout(token: string): Promise<void> {
    try {
      const userId = this.jwt.getUserIdFromToken(token);
      await this.refreshTokenRepository.deleteByUserId(userId);
      // Also end access tokens already issued (authMiddleware checks token_version)
      await this.userRepository.revokeAccessTokens(userId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new InternalServerError("Failed to logout");
    }
  }

  async verifyEmail(data: VerifyEmailDto): Promise<void> {
    try {
      const { userId } = this.jwt.verifySpecialToken(data.token, "email_verification");
      await this.userRepository.verifyEmail(userId);
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new InternalServerError("Failed to verify email");
    }
  }

  async forgotPassword(data: ForgotPasswordDto): Promise<void> {
    // There is no email provider yet, so outside development the code could never
    // reach the user. Say so instead of claiming an email was sent.
    // TODO: send the code by email once a provider is configured, then remove this.
    if (process.env.NODE_ENV !== "development") {
      throw new AppError(
        "Password reset by email is not available yet. Please contact support to reset your password.",
        503
      );
    }

    try {
      const user = await this.userRepository.findByEmail(data.email);
      if (!user) {
        // Don't reveal if email exists for security
        return;
      }

      // Keep a code that is still valid: repeated requests (by the user or by
      // someone else) must not invalidate the code the user just received
      if (user.resetCode && user.resetCodeExpiresAt && user.resetCodeExpiresAt > new Date()) {
        // TODO: re-send the existing code by email once a provider is configured
        if (process.env.NODE_ENV === "development") {
          console.log(`Password reset code for ${user.email}: ${user.resetCode}`);
        }
        return;
      }

      // Generate 6-character alphanumeric code (canonical spec)
      const resetCode = this.generateResetCode();

      // Code expires in 15 minutes
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      await this.userRepository.setResetCode(user.id, resetCode, expiresAt);

      // TODO: Send password reset email with code (no mail provider yet).
      // Never write the code to production logs: anyone with log access could take over the account.
      if (process.env.NODE_ENV === "development") {
        console.log(`Password reset code for ${user.email}: ${resetCode}`);
      }
    } catch (error) {
      throw new InternalServerError("Failed to process password reset request");
    }
  }

  async resetPassword(data: ResetPasswordDto): Promise<void> {
    try {
      // Find user by email
      const user = await this.userRepository.findByEmail(data.email);
      if (!user) {
        throw new BadRequestError("Invalid or expired code");
      }

      // Verify the reset code
      if (!user.resetCode || user.resetCode !== data.code) {
        throw new BadRequestError("Invalid or expired code");
      }

      // Check if code has expired
      if (!user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
        throw new BadRequestError("Invalid or expired code");
      }

      // Update password
      const passwordHash = await bcrypt.hash(data.newPassword, 10);
      await this.userRepository.updatePassword(user.id, passwordHash);

      // Clear the reset code
      await this.userRepository.clearResetCode(user.id);

      // Invalidate all refresh tokens for security
      await this.refreshTokenRepository.deleteByUserId(user.id);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError("Failed to reset password");
    }
  }

  /**
   * Generate a 6-character alphanumeric reset code
   */
  private generateResetCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async changePassword(userId: number, data: ChangePasswordDto): Promise<void> {
    try {
      if (!data.currentPassword || !data.newPassword) {
        throw new BadRequestError("Both current password and new password are required");
      }

      if (data.newPassword.length < 4) {
        throw new BadRequestError("New password must be at least 4 characters long");
      }

      if (data.currentPassword === data.newPassword) {
        throw new BadRequestError("New password must be different from your current password");
      }

      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError("User account not found");
      }

      // Check if user has a password (OAuth users might not have one)
      if (!user.passwordHash) {
        throw new BadRequestError("This account uses Google Sign-In and does not have a password.");
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        data.currentPassword,
        user.passwordHash
      );
      if (!isCurrentPasswordValid) {
        throw new BadRequestError("Current password is incorrect. Please verify your current password and try again.");
      }

      const passwordHash = await bcrypt.hash(data.newPassword, 10);
      await this.userRepository.updatePassword(userId, passwordHash);

      // Invalidate all refresh tokens for security
      await this.refreshTokenRepository.deleteByUserId(userId);
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof BadRequestError
      ) {
        throw error;
      }
      console.error("Change password error:", error);
      throw new InternalServerError("We're experiencing technical difficulties. Please try again later.");
    }
  }

  async updateProfile(userId: number, data: UpdateProfileDto): Promise<User> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) throw new NotFoundError("User");

      return await this.userRepository.updateUser(userId, data);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      mapUserWriteError(error);
      throw new InternalServerError("Failed to update profile");
    }
  }

  async getProfile(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findByIdWithSubscriptions(userId);
      if (!user) throw new NotFoundError("User");
      return user;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to get profile");
    }
  }

  private async buildJwtPayload(user: User & { subscriptions?: any[] }): Promise<TJwtPayload> {
    // Shared with Google login and authMiddleware: only ACTIVE, non-expired subscriptions count
    return buildJwtPayload(user, () => this.userRepository.getAllStudyPackIds());
  }
}

/**
 * Turn Prisma write errors caused by the request into client errors: a
 * duplicate email (e.g. two concurrent registrations) is a 409 and an unknown
 * universityId or specialtyId is a 400. Anything else is left to the caller.
 */
function mapUserWriteError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ConflictError("User already exists");
    }
    if (error.code === "P2003") {
      throw new BadRequestError("Invalid universityId or specialtyId");
    }
  }
}
