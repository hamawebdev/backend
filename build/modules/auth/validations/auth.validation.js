"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.verifyEmailSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.changePasswordSchema = exports.refreshTokenSchema = exports.loginSchema = exports.registrationSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.registrationSchema = zod_1.z.object({
    email: zod_1.z.string().email("A valid email is required"),
    password: zod_1.z.string().min(4, "Password must be at least 4 characters long"),
    fullName: zod_1.z.string().min(2, "Full name must be at least 2 characters long"),
    phoneNumber: zod_1.z.string().optional(),
    universityId: zod_1.z.number().optional(),
    specialtyId: zod_1.z.number().optional(),
    currentYear: zod_1.z.nativeEnum(client_1.YearLevel).default(client_1.YearLevel.ONE),
    deviceFingerprint: zod_1.z.string().optional(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email("A valid email is required"),
    password: zod_1.z.string().min(1, "Password is required"),
    deviceFingerprint: zod_1.z.string().optional(),
});
exports.refreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1, "Refresh token is required"),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, "Current password is required"),
    newPassword: zod_1.z.string().min(4, "New password must be at least 4 characters long")
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email("A valid email is required"),
});
exports.resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email("A valid email is required"),
    code: zod_1.z.string().min(1, "Verification code is required"),
    newPassword: zod_1.z.string().min(4, "New password must be at least 4 characters long")
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Verification token is required"),
});
exports.updateProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, "Full name must be at least 2 characters long").optional(),
    universityId: zod_1.z.number().optional(),
    specialtyId: zod_1.z.number().optional(),
    currentYear: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
