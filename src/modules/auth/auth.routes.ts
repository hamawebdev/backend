import { Router } from "express";
import { container } from "../../config/container";
import AuthController from "./auth.controller";
import { validateRequest } from "../../core/middlewares/RequestValidation.middleware";
import {
  registrationSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  updateProfileSchema
} from "./validations/auth.validation";
import authMiddleware from "../../core/middlewares/auth.middleware";
import passport, { googleOAuthEnabled } from "../../config/passport";
import { GoogleSignInRefusedError } from "./services/google-oauth.service";
import { authRateLimit, forgotPasswordIpRateLimit, forgotPasswordEmailRateLimit } from "../../middleware/rate-limit.middleware";

const authRouter = Router();
const authController = container.resolve(AuthController);

// Public routes
authRouter.post(
  "/register",
  authRateLimit,
  validateRequest(registrationSchema),
  (req, res, next) => authController.register(req, res, next)
);

authRouter.post(
  "/login",
  authRateLimit,
  validateRequest(loginSchema),
  (req, res, next) => authController.login(req, res, next)
);

authRouter.post(
  "/refresh",
  validateRequest(refreshTokenSchema),
  (req, res, next) => authController.refresh(req, res, next)
);

authRouter.post(
  "/verify-email",
  authRateLimit,
  validateRequest(verifyEmailSchema),
  (req, res, next) => authController.verifyEmail(req, res, next)
);

authRouter.post(
  "/forgot-password",
  forgotPasswordIpRateLimit,
  validateRequest(forgotPasswordSchema),
  forgotPasswordEmailRateLimit,
  (req, res, next) => authController.forgotPassword(req, res, next)
);

authRouter.post(
  "/reset-password",
  authRateLimit,
  validateRequest(resetPasswordSchema),
  (req, res, next) => authController.resetPassword(req, res, next)
);

// Google OAuth routes. Every outcome ends on the web app: success on /auth/callback
// (tokens in the URL fragment), failures on /login?error=oauth_failed.
authRouter.get("/google", (req, res, next) => {
  if (!googleOAuthEnabled) {
    authController.googleFailure(res, "unavailable");
    return;
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
    session: false,
  })(req, res, next);
});

authRouter.get("/google/callback", (req, res, next) => {
  if (!googleOAuthEnabled) {
    authController.googleFailure(res, "unavailable");
    return;
  }
  // Custom callback: errors (refused sign-in, deactivated account, bad or reused
  // code) and failures (consent cancelled, missing or wrong state) redirect to the
  // web login page instead of reaching the JSON error handler on the API host
  passport.authenticate("google", { session: false }, (err: any, result: any) => {
    if (err || !result) {
      if (err && !(err instanceof GoogleSignInRefusedError)) {
        console.error("Google OAuth callback error:", err?.message || err);
      }
      authController.googleFailure(res, err instanceof GoogleSignInRefusedError ? err.code : undefined);
      return;
    }
    (req as any).user = result;
    authController.googleCallback(req, res);
  })(req, res, next);
});

// Protected routes (require authentication)
authRouter.use(authMiddleware);

authRouter.post(
  "/logout",
  (req, res, next) => authController.logout(req, res, next)
);

authRouter.get(
  "/profile",
  (req, res, next) => authController.getProfile(req, res, next)
);

authRouter.put(
  "/profile",
  validateRequest(updateProfileSchema),
  (req, res, next) => authController.updateProfile(req, res, next)
);

authRouter.put(
  "/change-password",
  validateRequest(changePasswordSchema),
  (req, res, next) => authController.changePassword(req, res, next)
);

export default authRouter;
