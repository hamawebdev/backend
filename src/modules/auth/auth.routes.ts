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
import passport from "../../config/passport";

const authRouter = Router();
const authController = container.resolve(AuthController);

// Public routes
authRouter.post(
  "/register",
  validateRequest(registrationSchema),
  (req, res, next) => authController.register(req, res, next)
);

authRouter.post(
  "/login",
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
  validateRequest(verifyEmailSchema),
  (req, res, next) => authController.verifyEmail(req, res, next)
);

authRouter.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  (req, res, next) => authController.forgotPassword(req, res, next)
);

authRouter.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  (req, res, next) => authController.resetPassword(req, res, next)
);

// Google OAuth routes
authRouter.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login?error=oauth_failed" }),
  (req, res) => authController.googleCallback(req, res)
);

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
