import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import IAuthService from "./interfaces/IAuthService";
import ResponseUtils from "../../core/utils/response.utils";
import { RequestWithUser } from "../../types/types";

@injectable()
export default class AuthController {
  constructor(
    @inject("IAuthService") private authService: IAuthService,
    @inject("responseUtils") private responseUtils: ResponseUtils,
  ) {}

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await this.authService.register(req.body);
      // Canonical spec: { message, tokens: { accessToken, refreshToken } }
      this.responseUtils.sendSuccessResponse(res, {
        message: "Registration successful",
        tokens
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await this.authService.login(req.body);
      // Canonical spec: { tokens: { accessToken, refreshToken } } - no message
      this.responseUtils.sendSuccessResponse(res, { tokens });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.substring(7); // Remove 'Bearer ' prefix

      if (token) {
        await this.authService.logout(token);
      }

      // Canonical spec: { message: "Logged out successfully" }
      this.responseUtils.sendSuccessResponse(res, {
        message: "Logged out successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const tokens = await this.authService.refreshTokens(refreshToken);
      // Canonical spec: { tokens: { accessToken, refreshToken } } - no message
      this.responseUtils.sendSuccessResponse(res, { tokens });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.authService.verifyEmail(req.body);
      this.responseUtils.sendSuccessResponse(res, {
        message: "Email verified successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.authService.forgotPassword(req.body);
      // Canonical spec: { message: "Verification code sent to email" }
      this.responseUtils.sendSuccessResponse(res, {
        message: "Verification code sent to email"
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.authService.resetPassword(req.body);
      // Canonical spec: { message: "Password reset successful" }
      this.responseUtils.sendSuccessResponse(res, {
        message: "Password reset successful"
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        this.responseUtils.sendUnauthorizedResponse(res);
        return;
      }

      const user = await this.authService.getProfile(req.user.user_data.id);

      // Canonical spec: flat user object with specific fields
      // { id, email, fullName, role, universityId, specialtyId, currentYear, isActive, createdAt }
      const profileResponse = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        universityId: user.universityId,
        specialtyId: user.specialtyId,
        currentYear: user.currentYear,
        isActive: user.isActive,
        createdAt: user.createdAt
      };

      this.responseUtils.sendSuccessResponse(res, profileResponse);
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        this.responseUtils.sendUnauthorizedResponse(res);
        return;
      }

      const user = await this.authService.updateProfile(req.user.user_data.id, req.body);

      // Canonical spec: return updated user object directly (same shape as GET /auth/profile)
      const profileResponse = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        universityId: user.universityId,
        specialtyId: user.specialtyId,
        currentYear: user.currentYear,
        isActive: user.isActive,
        createdAt: user.createdAt
      };

      this.responseUtils.sendSuccessResponse(res, profileResponse);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        this.responseUtils.sendUnauthorizedResponse(res);
        return;
      }

      await this.authService.changePassword(req.user.user_data.id, req.body);

      // Canonical spec: { message: "Password changed successfully" }
      this.responseUtils.sendSuccessResponse(res, {
        message: "Password changed successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth callback handler
   * Redirects to frontend with tokens in query params
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const oauthResult = (req as any).user;
      
      if (!oauthResult || !oauthResult.tokens) {
        const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
        return res.redirect(`${clientUrl}/login?error=oauth_failed`);
      }

      const { tokens, isNewUser } = oauthResult;
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      
      // Redirect to frontend with tokens
      const redirectUrl = new URL(`${clientUrl}/auth/callback`);
      redirectUrl.searchParams.set("accessToken", tokens.accessToken);
      redirectUrl.searchParams.set("refreshToken", tokens.refreshToken);
      
      if (isNewUser) {
        redirectUrl.searchParams.set("isNewUser", "true");
      }

      res.redirect(redirectUrl.toString());
    } catch (error) {
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  }
}
