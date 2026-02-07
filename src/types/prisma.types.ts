/**
 * Prisma utility types for consistent typing across the codebase.
 * This file provides type definitions for common Prisma patterns.
 */

import { PrismaClient, Prisma } from '@prisma/client';

// Transaction client type for use in $transaction callbacks
export type TransactionClient = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Re-export PrismaClientKnownRequestError for error handling
export const PrismaClientKnownRequestError = Prisma.PrismaClientKnownRequestError;

// Re-export JsonValue for working with JSON fields
export type JsonValue = Prisma.JsonValue;

// Common entity types that are frequently used
export type {
    User,
    UserRole,
    YearLevel,
    PackType,
    SessionType,
    SessionStatus,
    QuizType,
    RetakeType,
    QuestionType,
    ResourceType,
    SubscriptionStatus,
    AuthProvider,
    ReportType,
    ReportStatus,
    TodoType,
    Priority,
    TodoStatus,
    ActivityType,
    // Models
    StudyPack,
    Subscription,
    Quiz,
    Question,
    QuestionAnswer,
    QuizSession,
    QuizAttempt,
    MultipleChoiceAttempt,
    Exam,
    University,
    Specialty,
    Unite,
    Module,
    Course,
    CourseResource,
    CourseProgress,
    QuestionSource,
    RefreshToken,
    ActivationCode,
    CodeRedemption,
    StudentCard,
    StudentCardCourse,
    CourseLayer,
    ModuleBook,
    StudentLabel,
    QuestionLabel,
    QuizLabel,
    QuizSessionLabel,
    StudentNote,
    NoteLabel,
    QuestionReport,
    TodoItem,
    EmployeeActivity,
    QuizQuestion,
    QuizSessionQuestion,
    ExamQuiz,
    ExamQuestion,
} from '@prisma/client';
