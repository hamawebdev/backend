import { User, Subscription, StudyPack, UserRole, YearLevel } from "@prisma/client";
import { Request } from "express";

// Auth types
export type TUserData = User;

export interface TAuthToken {
  accessToken: string;
  refreshToken: string;
}

export interface TJwtPayload {
  user_data: {
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
    universityId?: number;
    specialtyId?: number;
    currentYear: YearLevel;
    emailVerified: boolean;
    isActive: boolean;
  };
  subscriptions: Array<{
    id: number;
    study_pack_id: number;
    pack_name: string;
    pack_type: string;
    year_number?: string;
    end_date: string;
    days_remaining: number;
    accessible_year_levels: YearLevel[]; // New field for optimization
  }>;
  payment_status: 'active' | 'expired' | 'cancelled' | 'pending';
  has_active_subscription: boolean;
  accessible_study_packs: number[];
}

export type RequestWithUser = Request & {
  user?: any;
};

// Registration and Login DTOs
export interface RegisterDto {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  universityId?: number;
  specialtyId?: number;
  currentYear: YearLevel;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface UpdateProfileDto {
  fullName?: string;
  universityId?: number;
  specialtyId?: number;
  currentYear?: YearLevel;
}

// Pagination types
export type TPagination = {
  totalCount: number;
  totalPages: number;
  currentPage: number;
  perPage: number;
};

// Query parameters type
export type TFindInput = {
  page: number;  // Defaults to 1
  limit: number; // Defaults to 10
  search: string;
  sortBy: string; // Sorting field
  order: "asc" | "desc"; // Sorting order
  skip: number;
};

// Email verification
export interface VerifyEmailDto {
  token: string;
}

// Course Analytics types
export interface CourseAnalyticsQuery {
  sessionId?: number;
  sessionType?: 'PRACTICE' | 'EXAM' | 'MOCK';
  page?: number;
  limit?: number;
}

export interface CourseAnalytics {
  totalQuestions: number;
  totalCorrectAnswers: number;
  totalIncorrectAnswers: number;
  overallAccuracy: number;
}

export interface CourseInfo {
  id: number;
  name: string;
  description: string | null;
  moduleId: number;
  moduleName: string;
  courseAnalytics: CourseAnalytics;
}

export interface SessionAnalytics {
  id: number;
  title: string;
  type: 'PRACTICE' | 'EXAM' | 'MOCK';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  percentage: number;
  timeSpent: number; // in minutes
  averageTimePerQuestion: number; // in minutes
  courses: CourseInfo[];
}

export interface CourseAnalyticsResponse {
  success: true;
  data: {
    session: SessionAnalytics;
    pagination: {
      currentPage: number;
      totalItems: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}
