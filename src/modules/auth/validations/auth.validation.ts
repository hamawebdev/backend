import { z } from "zod";
import { YearLevel } from "@prisma/client";

export const registrationSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(4, "Password must be at least 4 characters long"),
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
  phoneNumber: z.string().optional(),
  universityId: z.number().optional(),
  specialtyId: z.number().optional(),
  currentYear: z.nativeEnum(YearLevel).default(YearLevel.ONE),
  deviceFingerprint: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
  deviceFingerprint: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(4, "New password must be at least 4 characters long")
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("A valid email is required"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("A valid email is required"),
  code: z.string().min(1, "Verification code is required"),
  newPassword: z.string().min(4, "New password must be at least 4 characters long")
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters long").optional(),
  universityId: z.number().optional(),
  specialtyId: z.number().optional(),
  currentYear: z.nativeEnum(YearLevel).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
}); 