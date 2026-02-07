import { inject, injectable } from "tsyringe";
import { User, AuthProvider, UserRole, YearLevel } from "@prisma/client";
import IUserRepository from "../../users/interfaces/IUserRepository";
import IRefreshTokenRepository from "../interfaces/IRefreshTokenRepository";
import JwtUtils from "../../../core/utils/jwt.utils";
import { TAuthToken, TJwtPayload } from "../../../types/types";
import { InternalServerError } from "../../../core/errors/AppError";

export interface GoogleProfile {
  id: string;
  displayName: string;
  name: {
    familyName?: string;
    givenName?: string;
  };
  emails: Array<{ value: string; verified?: boolean }>;
  photos: Array<{ value: string }>;
}

@injectable()
export class GoogleOAuthService {
  constructor(
    @inject("IUserRepository") private userRepository: IUserRepository,
    @inject("IRefreshTokenRepository") private refreshTokenRepository: IRefreshTokenRepository,
    @inject("jwt") private jwt: JwtUtils,
  ) {}

  /**
   * Handle Google OAuth authentication
   * - Find existing user by googleId
   * - If not found, find by email and link accounts
   * - If no user exists, create new user
   */
  async authenticate(profile: GoogleProfile): Promise<{ user: User; tokens: TAuthToken; isNewUser: boolean }> {
    try {
      const email = profile.emails?.[0]?.value;
      const avatarUrl = profile.photos?.[0]?.value;
      
      if (!email) {
        throw new InternalServerError("Email not provided by Google");
      }

      // Try to find user by googleId first
      let user = await this.findUserByGoogleId(profile.id);
      let isNewUser = false;

      if (user) {
        // Existing OAuth user - update avatar if changed
        if (avatarUrl && avatarUrl !== user.avatarUrl) {
          user = await this.userRepository.updateUser(user.id, { avatarUrl });
        }
      } else {
        // Try to find user by email for account linking
        const existingUser = await this.userRepository.findByEmail(email);
        
        if (existingUser) {
          // Link Google account to existing user
          user = await this.linkGoogleAccount(existingUser.id, profile.id, avatarUrl);
        } else {
          // Create new user
          user = await this.createOAuthUser(profile, email, avatarUrl);
          isNewUser = true;
        }
      }

      // Check if user is active
      if (!user.isActive) {
        throw new InternalServerError("Account is deactivated. Please contact support.");
      }

      // Update last login
      await this.userRepository.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      return { user, tokens, isNewUser };
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError("Failed to authenticate with Google");
    }
  }

  /**
   * Find user by Google ID
   */
  private async findUserByGoogleId(googleId: string): Promise<User | null> {
    // We need to add this method to the repository
    // For now, we'll use a workaround by finding through the database
    const prisma = (this.userRepository as any).prisma;
    if (prisma) {
      return prisma.user.findUnique({
        where: { googleId },
      });
    }
    return null;
  }

  /**
   * Link Google account to existing user
   */
  private async linkGoogleAccount(userId: number, googleId: string, avatarUrl?: string): Promise<User> {
    const updateData: any = {
      googleId,
      authProvider: AuthProvider.GOOGLE,
      emailVerified: true, // Google already verified the email
    };
    
    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl;
    }

    return this.userRepository.updateUser(userId, updateData);
  }

  /**
   * Create new OAuth user
   */
  private async createOAuthUser(profile: GoogleProfile, email: string, avatarUrl?: string): Promise<User> {
    const fullName = profile.displayName || 
      `${profile.name?.givenName || ""} ${profile.name?.familyName || ""}`.trim() || 
      email.split("@")[0];

    const prisma = (this.userRepository as any).prisma;
    if (!prisma) {
      throw new InternalServerError("Database connection not available");
    }

    return prisma.user.create({
      data: {
        email,
        fullName,
        googleId: profile.id,
        avatarUrl,
        authProvider: AuthProvider.GOOGLE,
        emailVerified: true, // Google already verified the email
        role: UserRole.STUDENT,
        currentYear: YearLevel.ONE,
        isActive: true,
        // passwordHash is optional (null for OAuth users)
      },
    });
  }

  /**
   * Generate JWT tokens for user
   */
  private async generateTokens(user: User): Promise<TAuthToken> {
    const jwtPayload = await this.buildJwtPayload(user);
    const accessToken = this.jwt.generateAccessToken(jwtPayload);
    const refreshToken = this.jwt.generateRefreshToken(user.id, user.email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 15);

    await this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }

  /**
   * Build JWT payload from user
   */
  private async buildJwtPayload(user: User): Promise<TJwtPayload> {
    // Get user with subscriptions - cast to any to access subscriptions property
    const userWithSubscriptions = await this.userRepository.findByIdWithSubscriptions(user.id) as any;
    
    const subscriptions = (userWithSubscriptions?.subscriptions || []).map((sub: any) => ({
      id: sub.id,
      study_pack_id: sub.studyPackId,
      pack_name: sub.studyPack?.name || "",
      pack_type: sub.studyPack?.type || "",
      year_number: sub.studyPack?.yearNumber || undefined,
      end_date: sub.endDate.toISOString(),
      days_remaining: Math.max(0, Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
      accessible_year_levels: this.getAccessibleYearLevels(sub.studyPack?.type, sub.studyPack?.yearNumber),
    }));

    // Filter active subscriptions
    const now = new Date();
    const activeSubscriptions = subscriptions.filter((sub: any) => new Date(sub.end_date) >= now);

    // Admin and Employee users don't need subscriptions
    const isAdminOrEmployee = user.role === UserRole.ADMIN || user.role === UserRole.EMPLOYEE;
    const hasActiveSubscription = isAdminOrEmployee || activeSubscriptions.length > 0;

    return {
      user_data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        universityId: user.universityId || undefined,
        specialtyId: user.specialtyId || undefined,
        currentYear: user.currentYear || YearLevel.ONE,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
      },
      subscriptions,
      payment_status: hasActiveSubscription ? "active" : "expired",
      has_active_subscription: hasActiveSubscription,
      accessible_study_packs: activeSubscriptions.map((sub: any) => sub.study_pack_id),
    };
  }

  /**
   * Get accessible year levels based on subscription type
   */
  private getAccessibleYearLevels(packType?: string, yearNumber?: string | null): YearLevel[] {
    if (packType === "RESIDENCY") {
      return [YearLevel.ONE, YearLevel.TWO, YearLevel.THREE, YearLevel.FOUR, YearLevel.FIVE, YearLevel.SIX, YearLevel.SEVEN];
    }
    
    if (yearNumber) {
      const yearMap: Record<string, YearLevel> = {
        "1": YearLevel.ONE,
        "2": YearLevel.TWO,
        "3": YearLevel.THREE,
        "4": YearLevel.FOUR,
        "5": YearLevel.FIVE,
        "6": YearLevel.SIX,
        "7": YearLevel.SEVEN,
      };
      const yearLevel = yearMap[yearNumber];
      return yearLevel ? [yearLevel] : [];
    }
    
    return [];
  }
}
