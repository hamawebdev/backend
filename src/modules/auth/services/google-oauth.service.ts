import { inject, injectable } from "tsyringe";
import { User, AuthProvider, UserRole, YearLevel } from "@prisma/client";
import IUserRepository from "../../users/interfaces/IUserRepository";
import IRefreshTokenRepository from "../interfaces/IRefreshTokenRepository";
import JwtUtils from "../../../core/utils/jwt.utils";
import { TAuthToken } from "../../../types/types";
import { buildJwtPayload } from "../jwt-payload.builder";
import { AppError, InternalServerError } from "../../../core/errors/AppError";

/**
 * A Google sign-in refused for a reason the user can act on. `code` is sent to
 * the web login page as ?reason=<code>.
 */
export class GoogleSignInRefusedError extends AppError {
  constructor(
    code: "email_missing" | "email_unverified" | "account_exists" | "account_deactivated",
    message: string
  ) {
    super(message, 403, undefined, code);
    this.name = "GoogleSignInRefusedError";
  }
}

// passport-google-oauth20 copies email_verified from Google's userinfo (a boolean)
function isVerifiedFlag(value: unknown): boolean {
  return value === true || value === "true";
}

export interface GoogleProfile {
  id: string;
  displayName: string;
  name: {
    familyName?: string;
    givenName?: string;
  };
  emails: Array<{ value: string; verified?: boolean | string }>;
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
   * - If not found and Google reports the email verified: link to an existing
   *   account with that email only when that account's email is verified too,
   *   otherwise create a new user
   */
  async authenticate(profile: GoogleProfile): Promise<{ user: User; tokens: TAuthToken; isNewUser: boolean }> {
    try {
      const email = profile.emails?.[0]?.value?.trim().toLowerCase();
      const googleEmailVerified = isVerifiedFlag(profile.emails?.[0]?.verified);
      const avatarUrl = profile.photos?.[0]?.value;

      if (!email) {
        throw new GoogleSignInRefusedError("email_missing", "Google did not provide an email address.");
      }

      // Try to find user by googleId first
      let user = await this.findUserByGoogleId(profile.id);
      let isNewUser = false;

      if (user) {
        if (!user.isActive) {
          throw new GoogleSignInRefusedError("account_deactivated", "Account is deactivated. Please contact support.");
        }
        // Existing OAuth user - update avatar if changed
        if (avatarUrl && avatarUrl !== user.avatarUrl) {
          user = await this.userRepository.updateUser(user.id, { avatarUrl });
        }
      } else {
        // An email Google has not verified proves nothing about who owns it:
        // never create or link an account from it
        if (!googleEmailVerified) {
          throw new GoogleSignInRefusedError(
            "email_unverified",
            "Your Google account's email address is not verified. Verify it with Google and try again."
          );
        }

        const existingUser = await this.userRepository.findByEmail(email);

        if (existingUser) {
          // Registration does not prove ownership of the email, so an unverified
          // account may have been created by someone else (pre-hijack). Only link
          // when the existing account's email is verified; otherwise the owner
          // must sign in with their password.
          if (!existingUser.emailVerified) {
            throw new GoogleSignInRefusedError(
              "account_exists",
              "An account with this email already exists. Log in with your email and password."
            );
          }
          if (!existingUser.isActive) {
            throw new GoogleSignInRefusedError("account_deactivated", "Account is deactivated. Please contact support.");
          }
          user = await this.linkGoogleAccount(existingUser.id, profile.id, avatarUrl);
        } else {
          // Create new user
          user = await this.createOAuthUser(profile, email, avatarUrl);
          isNewUser = true;
        }
      }

      // Check if user is active
      if (!user.isActive) {
        throw new GoogleSignInRefusedError("account_deactivated", "Account is deactivated. Please contact support.");
      }

      // Update last login
      await this.userRepository.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      return { user, tokens, isNewUser };
    } catch (error) {
      if (error instanceof GoogleSignInRefusedError || error instanceof InternalServerError) throw error;
      console.error("Google authentication error:", (error as Error)?.message || error);
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
    // Single device: a new sign-in ends the access tokens of any other session
    // (refreshTokenRepository.create below also drops their refresh tokens)
    const tokenVersion = await this.userRepository.revokeAccessTokens(user.id);

    // Same payload rules as password login and refresh: currentYear comes from the
    // subscriptions (not the editable profile field) and only ACTIVE, non-expired
    // subscriptions count. The new token carries the tokenVersion set above.
    const userWithSubscriptions = await this.userRepository.findByIdWithSubscriptions(user.id);
    const jwtPayload = await buildJwtPayload(
      { ...(userWithSubscriptions || user), tokenVersion } as any,
      () => this.userRepository.getAllStudyPackIds()
    );
    const accessToken = this.jwt.generateAccessToken(jwtPayload);
    const refreshToken = this.jwt.generateRefreshToken(user.id, user.email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 15);

    await this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }
}
