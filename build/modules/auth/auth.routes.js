"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const container_1 = require("../../config/container");
const auth_controller_1 = __importDefault(require("./auth.controller"));
const RequestValidation_middleware_1 = require("../../core/middlewares/RequestValidation.middleware");
const auth_validation_1 = require("./validations/auth.validation");
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const passport_1 = __importDefault(require("../../config/passport"));
const authRouter = (0, express_1.Router)();
const authController = container_1.container.resolve(auth_controller_1.default);
// Public routes
authRouter.post("/register", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.registrationSchema), (req, res, next) => authController.register(req, res, next));
authRouter.post("/login", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.loginSchema), (req, res, next) => authController.login(req, res, next));
authRouter.post("/refresh", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.refreshTokenSchema), (req, res, next) => authController.refresh(req, res, next));
authRouter.post("/verify-email", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.verifyEmailSchema), (req, res, next) => authController.verifyEmail(req, res, next));
authRouter.post("/forgot-password", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.forgotPasswordSchema), (req, res, next) => authController.forgotPassword(req, res, next));
authRouter.post("/reset-password", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.resetPasswordSchema), (req, res, next) => authController.resetPassword(req, res, next));
// Google OAuth routes
authRouter.get("/google", passport_1.default.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
}));
authRouter.get("/google/callback", passport_1.default.authenticate("google", { session: false, failureRedirect: "/login?error=oauth_failed" }), (req, res) => authController.googleCallback(req, res));
// Protected routes (require authentication)
authRouter.use(auth_middleware_1.default);
authRouter.post("/logout", (req, res, next) => authController.logout(req, res, next));
authRouter.get("/profile", (req, res, next) => authController.getProfile(req, res, next));
authRouter.put("/profile", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.updateProfileSchema), (req, res, next) => authController.updateProfile(req, res, next));
authRouter.put("/change-password", (0, RequestValidation_middleware_1.validateRequest)(auth_validation_1.changePasswordSchema), (req, res, next) => authController.changePassword(req, res, next));
exports.default = authRouter;
