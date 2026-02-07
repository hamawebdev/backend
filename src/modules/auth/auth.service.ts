import { inject, injectable } from "tsyringe";
import bcrypt from "bcryptjs";
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
  ConflictError,
  NotFoundError,
  InternalServerError,
  UnauthorizedError,
  BadRequestError,
} from "../../core/errors/AppError";
import { User, SubscriptionStatus, UserRole, YearLevel } from "@prisma/client";

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

      // TODO: Send email verification email
      console.log(`Email verification token for ${user.email}: ${emailVerificationToken}`);

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

      const deviceFingerprint = loginData.deviceFingerprint || 'unknown';
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

      // Get full payload including device fingerprint
      const { userId, deviceFingerprint } = this.jwt.getRefreshTokenPayload(refreshToken);

      const storedRefreshToken =
        await this.refreshTokenRepository.findByUserId(userId);

      if (!storedRefreshToken) {
        throw new UnauthorizedError("Refresh token not found. Please log in again.");
      }

      if (storedRefreshToken.token !== refreshToken) {
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

      await this.refreshTokenRepository.updateByUserId(
        user.id,
        newRefreshToken,
        expiresAt,
        deviceFingerprint,
      );

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
    try {
      const user = await this.userRepository.findByEmail(data.email);
      if (!user) {
        // Don't reveal if email exists for security
        return;
      }

      // Generate 6-character alphanumeric code (canonical spec)
      const resetCode = this.generateResetCode();

      // Code expires in 15 minutes
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      await this.userRepository.setResetCode(user.id, resetCode, expiresAt);

      // TODO: Send password reset email with code
      console.log(`Password reset code for ${user.email}: ${resetCode}`);
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
    // Use date-based filtering for active subscriptions (endDate is the source of truth)
    const now = new Date();
    const activeSubscriptions = user.subscriptions?.filter(
      (sub: any) => new Date(sub.endDate) > now
    ) || [];

    // Collect primary year levels from active subscriptions for currentYear determination
    const primaryYearLevels = new Set<YearLevel>();

    // Build subscriptions with accessible year levels (fully optimized - no database queries)
    const subscriptions = activeSubscriptions.map((sub: any) => {
      const endDate = new Date(sub.endDate);
      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Determine accessible year levels directly from study pack metadata (no DB queries)
      let accessibleYearLevels: YearLevel[] = [];
      let primaryYearLevel: YearLevel | null = null;

      if (sub.studyPack.type === 'RESIDENCY') {
        // Residency subscriptions have access to all year levels
        accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'] as YearLevel[];
        // For residency, we don't add a specific primary year - let it use user's original year
      } else if (sub.studyPack.type === 'YEAR') {
        // Year-specific packs: determine accessible years from study pack's yearNumber
        if (sub.studyPack.yearNumber) {
          // Use the study pack's year number as the primary year for currentYear determination
          primaryYearLevel = sub.studyPack.yearNumber as YearLevel;
          primaryYearLevels.add(primaryYearLevel);

          // For accessible year levels, use comprehensive access as per business logic
          accessibleYearLevels = this.getAccessibleYearLevelsForYearPack(primaryYearLevel);
        } else {
          // If pack doesn't specify a year, grant access to all years (fallback)
          accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'] as YearLevel[];
        }
      } else {
        // Unknown pack type - grant access to all years (fallback)
        accessibleYearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'] as YearLevel[];
      }

      return {
        id: sub.id,
        study_pack_id: sub.studyPackId,
        pack_name: sub.studyPack.name,
        pack_type: sub.studyPack.type.toLowerCase(),
        year_number: sub.studyPack.yearNumber,
        end_date: sub.endDate.toISOString(),
        days_remaining: Math.max(0, daysRemaining),
        accessible_year_levels: accessibleYearLevels
      };
    });

    // Admin and Employee users don't need subscriptions - they have full access
    const isAdminOrEmployee = user.role === UserRole.ADMIN || user.role === UserRole.EMPLOYEE;
    const hasActiveSubscription = isAdminOrEmployee || activeSubscriptions.length > 0;
    const paymentStatus = isAdminOrEmployee || hasActiveSubscription ? 'active' : 'pending';

    // For admin/employee users, give access to all study packs
    let accessibleStudyPacks: number[];
    if (isAdminOrEmployee) {
      // Get all study pack IDs for admin/employee access
      const allStudyPacks = await this.userRepository.getAllStudyPackIds();
      accessibleStudyPacks = allStudyPacks;
      // Admin/Employee users have access to all year levels - add highest year as primary
      primaryYearLevels.add('SEVEN');
    } else {
      accessibleStudyPacks = activeSubscriptions.map((sub: any) => sub.studyPackId);
    }

    // Determine currentYear from subscription-based year levels
    const currentYear = this.determineCurrentYearFromSubscriptions(primaryYearLevels, user.currentYear || 'ONE');


    return {
      user_data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        universityId: user.universityId || undefined,
        specialtyId: user.specialtyId || undefined,
        currentYear: currentYear,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
      },
      subscriptions,
      payment_status: paymentStatus,
      has_active_subscription: hasActiveSubscription,
      accessible_study_packs: accessibleStudyPacks,
    };
  }

  /**
   * Determine accessible year levels for year-specific study packs
   * Year-specific subscriptions should only grant access to their specific year level
   */
  private getAccessibleYearLevelsForYearPack(primaryYear: YearLevel): YearLevel[] {
    // Year-specific subscriptions grant access only to their specific year level
    // This ensures proper access control and prevents unauthorized access to other year levels
    return [primaryYear];
  }

  /**
   * Determine the currentYear field for JWT token based on active subscription year levels
   * Handles multiple active subscriptions with different year levels appropriately
   */
  private determineCurrentYearFromSubscriptions(allYearLevels: Set<YearLevel>, fallbackYear: YearLevel): YearLevel {
    // If no year levels from subscriptions, use the fallback (original user.currentYear)
    if (allYearLevels.size === 0) {
      return fallbackYear;
    }

    // Convert Set to Array for easier processing
    const yearLevelsArray = Array.from(allYearLevels);

    // If user has only one year level from subscriptions, use it
    if (yearLevelsArray.length === 1) {
      return yearLevelsArray[0];
    }

    // If user has multiple year levels, prioritize based on business logic:
    // 1. If the user's original currentYear is among the accessible years, keep it
    if (allYearLevels.has(fallbackYear)) {
      return fallbackYear;
    }

    // 2. Otherwise, choose the highest year level (most advanced)
    // Define year level order for comparison
    const yearOrder: { [key in YearLevel]: number } = {
      'ONE': 1,
      'TWO': 2,
      'THREE': 3,
      'FOUR': 4,
      'FIVE': 5,
      'SIX': 6,
      'SEVEN': 7
    };

    // Find the highest year level
    const highestYear = yearLevelsArray.reduce((highest, current) => {
      return yearOrder[current] > yearOrder[highest] ? current : highest;
    });

    return highestYear;
  }
}
