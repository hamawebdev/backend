import * as jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
// Define a type for string values that can be used in expiresIn
type StringOrNumber = string | number;
import { injectable, singleton } from "tsyringe";
import { UnauthorizedError } from "../errors/AppError";
import { TJwtPayload } from "../../types/types";

@singleton()
@injectable()
export default class JwtUtils {
  private readonly JWT_SECRET: string = process.env.JWT_SECRET ?? "your-secret-key";
  private readonly JWT_EXPIRATION: string = process.env.JWT_EXPIRATION || process.env.JWT_EXPIRES_IN || "15m";
  private readonly REFRESH_TOKEN_SECRET: string = process.env.REFRESH_TOKEN_SECRET ?? "your-refresh-secret";
  private readonly REFRESH_TOKEN_EXPIRY: string = process.env.REFRESH_TOKEN_EXPIRY || "25d";

  constructor() {
    if (!process.env.JWT_SECRET) {
      console.warn("⚠️ WARNING: JWT_SECRET is not set. Using default value. This is a security risk.");
    }
    if (!process.env.REFRESH_TOKEN_SECRET) {
      console.warn("⚠️ WARNING: REFRESH_TOKEN_SECRET is not set. Using default value. Tokens will be invalidated on restart.");
    }
    console.log(`🔑 JWT configured: accessToken expiry=${this.JWT_EXPIRATION}, refreshToken expiry=${this.REFRESH_TOKEN_EXPIRY}`);
  }

  generateAccessToken(payload: TJwtPayload): string {
    const options: SignOptions = { expiresIn: this.JWT_EXPIRATION as any };
    return jwt.sign(
      payload,
      String(this.JWT_SECRET),
      options
    );
  }

  generateRefreshToken(userId: number, email: string, deviceFingerprint: string = 'unknown'): string {
    const options: SignOptions = { expiresIn: this.REFRESH_TOKEN_EXPIRY as any };
    return jwt.sign(
      { userId, email, deviceFingerprint },
      String(this.REFRESH_TOKEN_SECRET),
      options
    );
  }

  verifyAccessToken(token: string): boolean {
    try {
      jwt.verify(token, String(this.JWT_SECRET));
      return true;
    } catch {
      return false;
    }
  }

  verifyRefreshToken(token: string): boolean {
    try {
      jwt.verify(token, String(this.REFRESH_TOKEN_SECRET));
      return true;
    } catch {
      return false;
    }
  }

  getUserIdFromToken(token: string): number {
    try {
      const decoded = jwt.verify(token, String(this.JWT_SECRET)) as TJwtPayload;
      return decoded.user_data.id;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError("Your session has expired. Please log in again.");
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError("Invalid authentication token. Please log in again.");
      } else {
        throw new UnauthorizedError("Authentication failed. Please log in again.");
      }
    }
  }

  getUserFromToken(token: string): TJwtPayload {
    try {
      const decoded = jwt.verify(token, String(this.JWT_SECRET)) as TJwtPayload;
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError("Your session has expired. Please log in again.");
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError("Invalid authentication token. Please log in again.");
      } else {
        throw new UnauthorizedError("Authentication failed. Please log in again.");
      }
    }
  }

  getUserFromRefreshToken(token: string): number {
    try {
      const decoded = jwt.verify(token, String(this.REFRESH_TOKEN_SECRET)) as {
        userId: number;
        email: string;
        deviceFingerprint?: string;
      };
      return decoded.userId;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError("Refresh token has expired. Please log in again.");
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError("Invalid refresh token. Please log in again.");
      } else {
        throw new UnauthorizedError("Token validation failed. Please log in again.");
      }
    }
  }

  getRefreshTokenPayload(token: string): { userId: number; email: string; deviceFingerprint: string } {
    try {
      const decoded = jwt.verify(token, String(this.REFRESH_TOKEN_SECRET)) as {
        userId: number;
        email: string;
        deviceFingerprint?: string;
      };
      return {
        userId: decoded.userId,
        email: decoded.email,
        deviceFingerprint: decoded.deviceFingerprint || 'unknown'
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError("Refresh token has expired. Please log in again.");
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError("Invalid refresh token. Please log in again.");
      } else {
        throw new UnauthorizedError("Token validation failed. Please log in again.");
      }
    }
  }

  // Generate password reset token
  generatePasswordResetToken(userId: number, email: string): string {
    const options: SignOptions = { expiresIn: "1h" as any }; // Reset token expires in 1 hour
    return jwt.sign(
      { userId, email, type: "password_reset" },
      String(this.JWT_SECRET),
      options
    );
  }

  // Generate email verification token
  generateEmailVerificationToken(userId: number, email: string): string {
    const options: SignOptions = { expiresIn: "24h" as any }; // Verification token expires in 24 hours
    return jwt.sign(
      { userId, email, type: "email_verification" },
      String(this.JWT_SECRET),
      options
    );
  }

  // Verify special tokens (password reset, email verification)
  verifySpecialToken(token: string, expectedType: string): { userId: number; email: string } {
    try {
      const decoded = jwt.verify(token, String(this.JWT_SECRET)) as {
        userId: number;
        email: string;
        type: string;
      };

      if (decoded.type !== expectedType) {
        throw new UnauthorizedError(`Invalid token type. Expected ${expectedType} token.`);
      }

      return { userId: decoded.userId, email: decoded.email };
    } catch (error: any) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        const tokenTypeMap: { [key: string]: string } = {
          'email_verification': 'Email verification link',
          'password_reset': 'Password reset link'
        };
        const tokenName = tokenTypeMap[expectedType] || 'Token';
        throw new UnauthorizedError(`${tokenName} has expired. Please request a new one.`);
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError("Invalid token. Please request a new verification link.");
      } else {
        throw new UnauthorizedError("Token verification failed. Please try again.");
      }
    }
  }
}
