"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkCreateResidencyQuestionsSchema = exports.residencyQuestionsQuerySchema = exports.updateResidencyQuestionSchema = exports.createResidencyQuestionSchema = exports.validateActivationCodeSchema = exports.getActivationCodesSchema = exports.updateActivationCodeSchema = exports.createActivationCodeSchema = exports.submitAnswerSchema = exports.updateQuestionSchema = exports.updateExamQuestionOrderSchema = exports.createRetakeSessionSchema = exports.analyticsQuerySchema = exports.idParamSchema = exports.updateQuestionSourceSchema = exports.createQuestionSourceSchema = exports.specialtiesQuerySchema = exports.updateSpecialtySchema = exports.createSpecialtySchema = exports.universitiesQuerySchema = exports.updateUniversitySchema = exports.createUniversitySchema = exports.reviewQuestionReportSchema = exports.activateSubscriptionSchema = exports.addMonthsSchema = exports.cancelSubscriptionSchema = exports.subscriptionFiltersSchema = exports.updateSubscriptionSchema = exports.createExamSchema = exports.createQuestionSchema = exports.updateQuizSchema = exports.createQuizSchema = exports.createCourseResourceSchema = exports.createCourseSchema = exports.createModuleSchema = exports.createUniteSchema = exports.updateStudyPackSchema = exports.createStudyPackSchema = exports.userFiltersSchema = exports.resetUserPasswordSchema = exports.updateUserSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const quiz_types_1 = require("../../../types/quiz.types");
const validation_middleware_1 = require("../../../middleware/validation.middleware");
// User Management Validations
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    fullName: zod_1.z.string().min(2, 'Full name must be at least 2 characters'),
    role: zod_1.z.nativeEnum(client_1.UserRole),
    universityId: zod_1.z.number().int().positive().optional(),
    specialtyId: zod_1.z.number().int().positive().optional(),
    currentYear: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
});
exports.updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().min(2).optional(),
    role: zod_1.z.nativeEnum(client_1.UserRole).optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    specialtyId: zod_1.z.number().int().positive().optional(),
    currentYear: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    isActive: zod_1.z.boolean().optional(),
    emailVerified: zod_1.z.boolean().optional(),
});
exports.resetUserPasswordSchema = zod_1.z.object({
    newPassword: zod_1.z.string().min(8, 'New password must be at least 8 characters'),
});
exports.userFiltersSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    role: zod_1.z.nativeEnum(client_1.UserRole).optional(),
    universityId: zod_1.z.coerce.number().int().positive().optional(),
    specialtyId: zod_1.z.coerce.number().int().positive().optional(),
    currentYear: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    isActive: zod_1.z.coerce.boolean().optional(),
    search: zod_1.z.string().optional(),
});
// Study Pack Management Validations
exports.createStudyPackSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    description: zod_1.z.string().optional(),
    type: zod_1.z.nativeEnum(client_1.PackType),
    yearNumber: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    pricePerMonth: zod_1.z.number().min(0, 'Price per month must be non-negative'),
    pricePerYear: zod_1.z.number().min(0, 'Price per year must be non-negative').optional(),
    isActive: zod_1.z.boolean().default(true),
});
exports.updateStudyPackSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    description: zod_1.z.string().optional(),
    type: zod_1.z.nativeEnum(client_1.PackType).optional(),
    yearNumber: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    pricePerMonth: zod_1.z.number().min(0, 'Price per month must be non-negative').optional(),
    pricePerYear: zod_1.z.number().min(0, 'Price per year must be non-negative').optional(),
    isActive: zod_1.z.boolean().optional(),
});
// Course Management Validations
exports.createUniteSchema = zod_1.z.object({
    studyPackId: zod_1.z.number().int().positive(),
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    logoUrl: zod_1.z.string().url().optional(),
});
exports.createModuleSchema = zod_1.z.object({
    uniteId: zod_1.z.number().int().positive().optional(),
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
});
exports.createCourseSchema = zod_1.z.object({
    moduleId: zod_1.z.number().int().positive(),
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
});
exports.createCourseResourceSchema = zod_1.z.object({
    courseId: zod_1.z.number().int().positive(),
    type: zod_1.z.nativeEnum(client_1.ResourceType),
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    filePath: zod_1.z.string().optional(),
    externalUrl: zod_1.z.string().url().optional(),
    youtubeVideoId: zod_1.z.string().optional(),
    isPaid: zod_1.z.boolean().default(false),
    price: zod_1.z.number().min(0).optional(),
});
// Quiz Management Validations
exports.createQuizSchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    type: zod_1.z.nativeEnum(client_1.QuizType).default('PRACTICE'),
    courseId: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    quizYear: zod_1.z.number()
        .int("Quiz year must be an integer")
        .min(1900, "Quiz year must be 1900 or later")
        .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
        .optional(),
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string().min(5),
        explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
        questionType: zod_1.z.nativeEnum(quiz_types_1.QuestionType).optional().default(quiz_types_1.QuestionType.SINGLE_CHOICE),
        answers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string().min(1),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
            images: zod_1.z.array(zod_1.z.object({
                imagePath: zod_1.z.string(),
                altText: zod_1.z.string().optional(),
            })).optional(),
        })).min(2),
    }).refine((data) => {
        // Validation for question types and correct answers
        const correctAnswers = data.answers.filter((answer) => answer.isCorrect);
        if (data.questionType === quiz_types_1.QuestionType.SINGLE_CHOICE) {
            return correctAnswers.length === 1;
        }
        else if (data.questionType === quiz_types_1.QuestionType.MULTIPLE_CHOICE) {
            return correctAnswers.length >= 1;
        }
        else {
            // Default behavior: require exactly one correct answer for backward compatibility
            return correctAnswers.length === 1;
        }
    }, {
        message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 1 correct answer",
        path: ["answers"]
    })).min(1),
});
exports.updateQuizSchema = zod_1.z.object({
    title: zod_1.z.string().min(2).optional(),
    description: zod_1.z.string().optional(),
    type: zod_1.z.nativeEnum(client_1.QuizType).optional(),
    courseId: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    quizYear: zod_1.z.number()
        .int("Quiz year must be an integer")
        .min(1900, "Quiz year must be 1900 or later")
        .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
        .optional(),
});
// Question Management Validations
exports.createQuestionSchema = zod_1.z.object({
    courseId: zod_1.z.number().int().positive().optional(),
    examId: zod_1.z.number().int().positive().optional(), // New field for exam association
    questionText: zod_1.z.string().min(5),
    explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
    questionType: zod_1.z.nativeEnum(quiz_types_1.QuestionType).optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    metadata: zod_1.z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
    answers: zod_1.z.array(zod_1.z.object({
        answerText: zod_1.z.string().min(1),
        isCorrect: zod_1.z.boolean(),
        explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
        images: zod_1.z.array(zod_1.z.object({
            imagePath: zod_1.z.string(),
            altText: zod_1.z.string().optional(),
        })).optional(),
    })).min(2),
}).refine((data) => {
    // Validation for question types and correct answers
    const correctAnswers = data.answers.filter((answer) => answer.isCorrect);
    if (data.questionType === quiz_types_1.QuestionType.SINGLE_CHOICE) {
        return correctAnswers.length === 1;
    }
    else if (data.questionType === quiz_types_1.QuestionType.MULTIPLE_CHOICE) {
        return correctAnswers.length >= 2;
    }
    else {
        // Default behavior: allow single or multiple correct answers
        return correctAnswers.length >= 1;
    }
}, {
    message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 2 correct answers",
    path: ["answers"]
});
// Exam Management Validations
exports.createExamSchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    moduleId: zod_1.z.number().int().positive(),
    universityId: zod_1.z.number().int().positive(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel),
    examYear: zod_1.z.string().datetime(),
    year: zod_1.z.number().int().min(2000).max(2100), // Valid 4-digit year range
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string().min(5),
        explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
        answers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string().min(1),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
            images: zod_1.z.array(zod_1.z.object({
                imagePath: zod_1.z.string(),
                altText: zod_1.z.string().optional(),
            })).optional(),
        })).min(2),
    })).min(1),
});
// Subscription Management Validations (Canonical spec)
exports.updateSubscriptionSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
exports.subscriptionFiltersSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional(),
    userId: zod_1.z.coerce.number().int().positive().optional(),
    studyPackId: zod_1.z.coerce.number().int().positive().optional(),
});
// Monthly Subscription Management Validations
exports.cancelSubscriptionSchema = zod_1.z.object({
    reason: zod_1.z.string().min(1, 'Cancellation reason is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});
exports.addMonthsSchema = zod_1.z.object({
    months: zod_1.z.number().int().min(1, 'Must add at least 1 month').max(24, 'Cannot add more than 24 months at once'),
    reason: zod_1.z.string().min(1, 'Reason for adding months is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});
exports.activateSubscriptionSchema = zod_1.z.object({
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    reason: zod_1.z.string().min(1, 'Activation reason is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});
// Question Report Management Validations (Canonical spec)
exports.reviewQuestionReportSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED'], {
        required_error: 'Status is required'
    }),
    adminNotes: zod_1.z.string().max(1000, 'Admin notes cannot exceed 1000 characters').optional(),
});
// University & Specialty Management Validations
exports.createUniversitySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'University name must be at least 2 characters'),
    country: zod_1.z.string().min(2, 'Country must be at least 2 characters'),
    city: zod_1.z.string().min(2, 'City must be at least 2 characters').optional(),
});
exports.updateUniversitySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'University name must be at least 2 characters').optional(),
    country: zod_1.z.string().min(2, 'Country must be at least 2 characters').optional(),
    city: zod_1.z.string().min(2, 'City must be at least 2 characters').optional(),
});
exports.universitiesQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    search: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
});
exports.createSpecialtySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Specialty name must be at least 2 characters'),
});
exports.updateSpecialtySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Specialty name must be at least 2 characters'),
});
exports.specialtiesQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    search: zod_1.z.string().optional(),
});
// Question Source Management Validations
exports.createQuestionSourceSchema = zod_1.z.object({
    name: zod_1.z.string()
        .trim()
        .min(2, "Question source name must be at least 2 characters")
        .max(100, "Question source name must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9\s\-_]+$/, "Question source name can only contain letters, numbers, spaces, hyphens, and underscores")
});
exports.updateQuestionSourceSchema = zod_1.z.object({
    name: zod_1.z.string()
        .trim()
        .min(2, "Question source name must be at least 2 characters")
        .max(100, "Question source name must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9\s\-_]+$/, "Question source name can only contain letters, numbers, spaces, hyphens, and underscores")
        .optional()
});
// Parameter validations
exports.idParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
// Analytics query validations
exports.analyticsQuerySchema = zod_1.z.object({
    timeframe: zod_1.z.enum(['day', 'week', 'month', 'year']).default('month'),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
// Retake Session Validations
exports.createRetakeSessionSchema = zod_1.z.object({
    originalSessionId: zod_1.z.number().int().positive('Original session ID must be a positive integer'),
    retakeType: zod_1.z.nativeEnum(client_1.RetakeType, {
        errorMap: () => ({ message: 'Retake type must be SAME, INCORRECT_ONLY, CORRECT_ONLY, or NOT_RESPONDED' })
    }),
    title: zod_1.z.string().min(3).max(100).optional(),
});
// Exam Question Ordering Validations
exports.updateExamQuestionOrderSchema = zod_1.z.object({
    examId: zod_1.z.number().int().positive('Exam ID must be a positive integer'),
    questionOrders: zod_1.z.array(zod_1.z.object({
        questionId: zod_1.z.number().int().positive('Question ID must be a positive integer'),
        orderInExam: zod_1.z.number().int().min(1, 'Order must be at least 1'),
    })).min(1, 'Must provide at least one question order'),
});
// Enhanced Question Update Schema
exports.updateQuestionSchema = zod_1.z.object({
    courseId: zod_1.z.number().int().positive().optional(),
    examId: zod_1.z.number().int().positive().optional(),
    questionText: zod_1.z.string().min(5).optional(),
    explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
    questionType: zod_1.z.nativeEnum(quiz_types_1.QuestionType).optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    metadata: zod_1.z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
    answers: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.number().int().positive().optional(), // For existing answers
        answerText: zod_1.z.string().min(1),
        isCorrect: zod_1.z.boolean(),
        explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
        images: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.number().int().positive().optional(), // For existing images
            imagePath: zod_1.z.string(),
            altText: zod_1.z.string().optional(),
        })).optional(),
    })).min(2).optional(),
}).refine((data) => {
    // Only validate if answers are provided
    if (!data.answers)
        return true;
    const correctAnswers = data.answers.filter((answer) => answer.isCorrect);
    if (data.questionType === quiz_types_1.QuestionType.SINGLE_CHOICE) {
        return correctAnswers.length === 1;
    }
    else if (data.questionType === quiz_types_1.QuestionType.MULTIPLE_CHOICE) {
        return correctAnswers.length >= 2;
    }
    else {
        // Default behavior: allow single or multiple correct answers
        return correctAnswers.length >= 1;
    }
}, {
    message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 2 correct answers",
    path: ["answers"]
});
// Submit Answer Validation Schema
exports.submitAnswerSchema = zod_1.z.object({
    answers: zod_1.z.array(zod_1.z.object({
        questionId: zod_1.z.number().int().positive(),
        selectedAnswerId: zod_1.z.number().int().positive().optional(),
        selectedAnswerIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    }).refine((data) => {
        // Either selectedAnswerId or selectedAnswerIds must be provided, but not both
        const hasSingle = data.selectedAnswerId !== undefined;
        const hasMultiple = data.selectedAnswerIds !== undefined && data.selectedAnswerIds.length > 0;
        return (hasSingle && !hasMultiple) || (!hasSingle && hasMultiple);
    }, {
        message: "Either selectedAnswerId or selectedAnswerIds must be provided, but not both"
    })).min(1, "At least one answer must be provided")
});
// ==========================================
// ACTIVATION CODE MANAGEMENT VALIDATIONS
// ==========================================
// Create Activation Code Validation (Canonical spec)
// Supports both legacy (code, studyPackId) and new format (studyPackIds, expiresAt)
exports.createActivationCodeSchema = zod_1.z.object({
    code: zod_1.z.string()
        .min(1, 'Activation code cannot be empty')
        .max(50, 'Activation code cannot exceed 50 characters')
        .trim()
        .optional(), // Optional - will be auto-generated if not provided
    description: zod_1.z.string()
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
    // Support both single studyPackId and array of studyPackIds
    studyPackId: zod_1.z.number()
        .int('Study pack ID must be an integer')
        .positive('Study pack ID must be positive')
        .optional(),
    studyPackIds: zod_1.z.array(zod_1.z.number().int('Study pack ID must be an integer').positive('Study pack ID must be positive'))
        .min(1, 'At least one study pack must be selected')
        .optional(),
    // Support both expiryDate and expiresAt
    expiryDate: zod_1.z.string()
        .datetime('Invalid expiry date format')
        .optional(),
    expiresAt: zod_1.z.string()
        .datetime('Invalid expiry date format')
        .optional(),
    maxUses: zod_1.z.number()
        .int('Max uses must be an integer')
        .min(1, 'Max uses must be at least 1')
        .optional(),
    // Support both duration types
    durationType: zod_1.z.enum(['MONTHS', 'DAYS']).default('MONTHS'),
    durationMonths: zod_1.z.number()
        .int('Duration must be an integer')
        .min(1, 'Duration must be at least 1 month')
        .max(60, 'Duration cannot exceed 60 months')
        .optional(),
    durationDays: zod_1.z.number()
        .int('Duration must be an integer')
        .min(1, 'Duration must be at least 1 day')
        .max(1825, 'Duration cannot exceed 1825 days')
        .optional(),
    isActive: zod_1.z.boolean().default(true)
}).refine((data) => {
    // Require either studyPackId or studyPackIds
    return data.studyPackId !== undefined || (data.studyPackIds !== undefined && data.studyPackIds.length > 0);
}, {
    message: 'Either studyPackId or studyPackIds must be provided',
    path: ['studyPackId']
});
// Update Activation Code Validation (Canonical spec - all fields optional)
exports.updateActivationCodeSchema = zod_1.z.object({
    code: zod_1.z.string()
        .min(1, 'Activation code cannot be empty')
        .max(50, 'Activation code cannot exceed 50 characters')
        .trim()
        .optional(),
    studyPackId: zod_1.z.number()
        .int('Study pack ID must be an integer')
        .positive('Study pack ID must be positive')
        .optional(),
    expiryDate: zod_1.z.string()
        .datetime('Invalid expiry date format')
        .optional(),
    maxUses: zod_1.z.number()
        .int('Max uses must be an integer')
        .min(1, 'Max uses must be at least 1')
        .optional(),
    durationMonths: zod_1.z.number()
        .int('Duration must be an integer')
        .min(1, 'Duration must be at least 1 month')
        .optional(),
    isActive: zod_1.z.boolean().optional()
});
// Get Activation Codes Filters Validation (Canonical spec)
exports.getActivationCodesSchema = zod_1.z.object({
    page: zod_1.z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : 1)
        .refine((val) => val > 0, { message: 'Page must be a positive number' }),
    limit: zod_1.z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : 10)
        .refine((val) => val > 0 && val <= 100, {
        message: 'Limit must be between 1 and 100'
    }),
    isActive: zod_1.z.string()
        .optional()
        .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined),
    search: zod_1.z.string()
        .max(100, 'Search term cannot exceed 100 characters')
        .optional(),
    studyPackId: zod_1.z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : undefined)
        .refine((val) => val === undefined || val > 0, {
        message: 'Study pack ID must be a positive number'
    }),
    expiryDate: zod_1.z.string()
        .datetime('Invalid expiry date format')
        .optional()
});
// Validate Activation Code (Student) Validation
exports.validateActivationCodeSchema = zod_1.z.object({
    code: zod_1.z.string()
        .min(8, 'Activation code must be at least 8 characters')
        .max(32, 'Activation code cannot exceed 32 characters')
        .regex(/^[A-Z0-9-]+$/, 'Activation code can only contain uppercase letters, numbers, and hyphens')
        .transform((val) => val.toUpperCase().trim())
});
// ==========================================
// RESIDENCY QUESTION MANAGEMENT (Canonical spec)
// ==========================================
// Answer schema for residency questions
const residencyQuestionAnswerSchema = zod_1.z.object({
    answerText: zod_1.z.string().min(1, 'Answer text is required'),
    isCorrect: zod_1.z.boolean()
});
// Create Residency Question Validation
exports.createResidencyQuestionSchema = zod_1.z.object({
    questionText: zod_1.z.string().min(1, 'Question text is required'),
    part: zod_1.z.enum(['PART_1', 'PART_2'], { errorMap: () => ({ message: 'Part must be PART_1 or PART_2' }) }),
    explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
    examYear: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    metadata: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    repetitionCount: zod_1.z.number().int().min(0).optional(),
    repetitionYears: zod_1.z.array(zod_1.z.number().int()).optional(),
    questionAnswers: zod_1.z.array(residencyQuestionAnswerSchema)
        .min(1, 'At least one answer is required')
        .refine((answers) => answers.some(a => a.isCorrect), { message: 'At least one answer must be marked as correct' })
});
// Update Residency Question Validation (all fields optional)
exports.updateResidencyQuestionSchema = zod_1.z.object({
    questionText: zod_1.z.string().min(1).optional(),
    part: zod_1.z.enum(['PART_1', 'PART_2']).optional(),
    explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
    examYear: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    metadata: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    repetitionCount: zod_1.z.number().int().min(0).optional(),
    repetitionYears: zod_1.z.array(zod_1.z.number().int()).optional(),
    questionAnswers: zod_1.z.array(residencyQuestionAnswerSchema)
        .min(1)
        .refine((answers) => answers.some(a => a.isCorrect), { message: 'At least one answer must be marked as correct' })
        .optional()
});
// Query params for listing residency questions
exports.residencyQuestionsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    part: zod_1.z.enum(['PART_1', 'PART_2']).optional(),
    examYear: zod_1.z.coerce.number().int().positive().optional(),
    universityId: zod_1.z.coerce.number().int().positive().optional(),
    search: zod_1.z.string().optional()
});
// Bulk Create Residency Questions Validation
exports.bulkCreateResidencyQuestionsSchema = zod_1.z.object({
    universityId: zod_1.z.number().int().positive('University ID must be a positive integer'),
    examYear: zod_1.z.number().int().positive('Exam year must be a positive integer'),
    part: zod_1.z.string().min(1, 'Part is required'),
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string().min(1, 'Question text is required'),
        explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined),
        metadata: zod_1.z.string().optional(),
        questionAnswers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string().min(1, 'Answer text is required'),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string().optional().transform(val => val ? (0, validation_middleware_1.sanitizeMarkdown)(val) : undefined)
        }))
            .min(1, 'At least one answer is required')
            .refine((answers) => answers.some(a => a.isCorrect), { message: 'At least one answer must be marked as correct' })
    })).min(1, 'At least one question is required')
});
