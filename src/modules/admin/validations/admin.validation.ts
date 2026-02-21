import { z } from 'zod';
import { UserRole, YearLevel, PackType, QuizType, ResourceType, SubscriptionStatus, RetakeType } from '@prisma/client';
import { QuestionType } from '../../../types/quiz.types';
import { sanitizeMarkdown } from '../../../middleware/validation.middleware';

// User Management Validations
export const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  role: z.nativeEnum(UserRole),
  universityId: z.number().int().positive().optional(),
  specialtyId: z.number().int().positive().optional(),
  currentYear: z.nativeEnum(YearLevel).optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).optional(),
  universityId: z.number().int().positive().optional(),
  specialtyId: z.number().int().positive().optional(),
  currentYear: z.nativeEnum(YearLevel).optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const userFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.nativeEnum(UserRole).optional(),
  universityId: z.coerce.number().int().positive().optional(),
  specialtyId: z.coerce.number().int().positive().optional(),
  currentYear: z.nativeEnum(YearLevel).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// Study Pack Management Validations
export const createStudyPackSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  type: z.nativeEnum(PackType),
  yearNumber: z.nativeEnum(YearLevel).optional(),
  pricePerMonth: z.number().min(0, 'Price per month must be non-negative'),
  pricePerYear: z.number().min(0, 'Price per year must be non-negative').optional(),
  isActive: z.boolean().default(true),
});

export const updateStudyPackSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  type: z.nativeEnum(PackType).optional(),
  yearNumber: z.nativeEnum(YearLevel).optional(),
  pricePerMonth: z.number().min(0, 'Price per month must be non-negative').optional(),
  pricePerYear: z.number().min(0, 'Price per year must be non-negative').optional(),
  isActive: z.boolean().optional(),
});

// Course Management Validations
export const createUniteSchema = z.object({
  studyPackId: z.number().int().positive(),
  name: z.string().min(2),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export const createModuleSchema = z.object({
  uniteId: z.number().int().positive().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
});

export const createSubModuleSchema = z.object({
  moduleId: z.number().int().positive(),
  name: z.string().min(2),
  courseIds: z.array(z.number().int().positive()).optional(),
});

export const createCourseSchema = z.object({
  moduleId: z.number().int().positive(),
  name: z.string().min(2),
  description: z.string().optional(),
});

export const createCourseResourceSchema = z.object({
  courseId: z.number().int().positive(),
  type: z.nativeEnum(ResourceType),
  title: z.string().min(2),
  description: z.string().optional(),
  filePath: z.string().optional(),
  externalUrl: z.string().url().optional(),
  youtubeVideoId: z.string().optional(),
  isPaid: z.boolean().default(false),
  price: z.number().min(0).optional(),
});

// Quiz Management Validations
export const createQuizSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(QuizType).default('PRACTICE'),
  courseId: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),

  quizYear: z.number()
    .int("Quiz year must be an integer")
    .min(1900, "Quiz year must be 1900 or later")
    .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
    .optional(),
  questions: z.array(z.object({
    questionText: z.string().min(2),
    explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
    questionType: z.nativeEnum(QuestionType).optional().default(QuestionType.SINGLE_CHOICE),
    answers: z.array(z.object({
      answerText: z.string().min(1),
      isCorrect: z.boolean(),
      explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
      images: z.array(z.object({
        imagePath: z.string(),
        altText: z.string().optional(),
      })).optional(),
    })).min(2),
  }).refine((data: any) => {
    // Validation for question types and correct answers
    const correctAnswers = data.answers.filter((answer: any) => answer.isCorrect);

    if (data.questionType === QuestionType.SINGLE_CHOICE) {
      return correctAnswers.length === 1;
    } else if (data.questionType === QuestionType.MULTIPLE_CHOICE) {
      return correctAnswers.length >= 1;
    } else {
      // Default behavior: require exactly one correct answer for backward compatibility
      return correctAnswers.length === 1;
    }
  }, {
    message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 1 correct answer",
    path: ["answers"]
  })).min(1),
});

export const updateQuizSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  type: z.nativeEnum(QuizType).optional(),
  courseId: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),

  quizYear: z.number()
    .int("Quiz year must be an integer")
    .min(1900, "Quiz year must be 1900 or later")
    .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
    .optional(),
});

// Question Management Validations
export const createQuestionSchema = z.object({
  courseId: z.number().int().positive().optional(),
  examId: z.number().int().positive().optional(), // New field for exam association
  questionText: z.string().min(2),
  explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
  questionType: z.nativeEnum(QuestionType).optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
  answers: z.array(z.object({
    answerText: z.string().min(1),
    isCorrect: z.boolean(),
    explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
    images: z.array(z.object({
      imagePath: z.string(),
      altText: z.string().optional(),
    })).optional(),
  })).min(2),
}).refine((data: any) => {
  // Validation for question types and correct answers
  const correctAnswers = data.answers.filter((answer: any) => answer.isCorrect);

  if (data.questionType === QuestionType.SINGLE_CHOICE) {
    return correctAnswers.length === 1;
  } else if (data.questionType === QuestionType.MULTIPLE_CHOICE) {
    return correctAnswers.length >= 2;
  } else {
    // Default behavior: allow single or multiple correct answers
    return correctAnswers.length >= 1;
  }
}, {
  message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 2 correct answers",
  path: ["answers"]
});



// Exam Management Validations
export const createExamSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  moduleId: z.number().int().positive(),
  universityId: z.number().int().positive(),
  yearLevel: z.nativeEnum(YearLevel),
  examYear: z.string().datetime(),
  year: z.number().int().min(2000).max(2100), // Valid 4-digit year range
  questions: z.array(z.object({
    questionText: z.string().min(2),
    explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
    answers: z.array(z.object({
      answerText: z.string().min(1),
      isCorrect: z.boolean(),
      explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
      images: z.array(z.object({
        imagePath: z.string(),
        altText: z.string().optional(),
      })).optional(),
    })).min(2),
  })).min(1),
});

// Subscription Management Validations (Canonical spec)
export const updateSubscriptionSchema = z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  endDate: z.string().datetime().optional(),
});

export const subscriptionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  userId: z.coerce.number().int().positive().optional(),
  studyPackId: z.coerce.number().int().positive().optional(),
});

// Monthly Subscription Management Validations
export const cancelSubscriptionSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});

export const addMonthsSchema = z.object({
  months: z.number().int().min(1, 'Must add at least 1 month').max(24, 'Cannot add more than 24 months at once'),
  reason: z.string().min(1, 'Reason for adding months is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});

export const activateSubscriptionSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  reason: z.string().min(1, 'Activation reason is required').max(500, 'Reason cannot exceed 500 characters').optional(),
});

// Question Report Management Validations (Canonical spec)
export const reviewQuestionReportSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED'], {
    required_error: 'Status is required'
  }),
  adminNotes: z.string().max(1000, 'Admin notes cannot exceed 1000 characters').optional(),
});

// University & Specialty Management Validations
export const createUniversitySchema = z.object({
  name: z.string().min(2, 'University name must be at least 2 characters'),
  country: z.string().min(2, 'Country must be at least 2 characters'),
  city: z.string().min(2, 'City must be at least 2 characters').optional(),
});

export const updateUniversitySchema = z.object({
  name: z.string().min(2, 'University name must be at least 2 characters').optional(),
  country: z.string().min(2, 'Country must be at least 2 characters').optional(),
  city: z.string().min(2, 'City must be at least 2 characters').optional(),
});

export const universitiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  country: z.string().optional(),
});

export const createSpecialtySchema = z.object({
  name: z.string().min(2, 'Specialty name must be at least 2 characters'),
});

export const updateSpecialtySchema = z.object({
  name: z.string().min(2, 'Specialty name must be at least 2 characters'),
});

export const specialtiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
});

// Question Source Management Validations
export const createQuestionSourceSchema = z.object({
  name: z.string()
    .trim()
    .min(2, "Question source name must be at least 2 characters")
    .max(100, "Question source name must not exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Question source name can only contain letters, numbers, spaces, hyphens, and underscores")
});

export const updateQuestionSourceSchema = z.object({
  name: z.string()
    .trim()
    .min(2, "Question source name must be at least 2 characters")
    .max(100, "Question source name must not exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Question source name can only contain letters, numbers, spaces, hyphens, and underscores")
    .optional()
});



// Parameter validations
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Analytics query validations
export const analyticsQuerySchema = z.object({
  timeframe: z.enum(['day', 'week', 'month', 'year']).default('month'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Retake Session Validations
export const createRetakeSessionSchema = z.object({
  originalSessionId: z.number().int().positive('Original session ID must be a positive integer'),
  retakeType: z.nativeEnum(RetakeType, {
    errorMap: () => ({ message: 'Retake type must be SAME, INCORRECT_ONLY, CORRECT_ONLY, or NOT_RESPONDED' })
  }),
  title: z.string().min(3).max(100).optional(),
});

// Exam Question Ordering Validations
export const updateExamQuestionOrderSchema = z.object({
  examId: z.number().int().positive('Exam ID must be a positive integer'),
  questionOrders: z.array(z.object({
    questionId: z.number().int().positive('Question ID must be a positive integer'),
    orderInExam: z.number().int().min(1, 'Order must be at least 1'),
  })).min(1, 'Must provide at least one question order'),
});

// Enhanced Question Update Schema
export const updateQuestionSchema = z.object({
  courseId: z.number().int().positive().optional(),
  examId: z.number().int().positive().optional(),
  questionText: z.string().min(2).optional(),
  explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
  questionType: z.nativeEnum(QuestionType).optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
  answers: z.array(z.object({
    id: z.number().int().positive().optional(), // For existing answers
    answerText: z.string().min(1),
    isCorrect: z.boolean(),
    explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
    images: z.array(z.object({
      id: z.number().int().positive().optional(), // For existing images
      imagePath: z.string(),
      altText: z.string().optional(),
    })).optional(),
  })).min(2).optional(),
}).refine((data: any) => {
  // Only validate if answers are provided
  if (!data.answers) return true;

  const correctAnswers = data.answers.filter((answer: any) => answer.isCorrect);

  if (data.questionType === QuestionType.SINGLE_CHOICE) {
    return correctAnswers.length === 1;
  } else if (data.questionType === QuestionType.MULTIPLE_CHOICE) {
    return correctAnswers.length >= 2;
  } else {
    // Default behavior: allow single or multiple correct answers
    return correctAnswers.length >= 1;
  }
}, {
  message: "Single choice questions must have exactly 1 correct answer, multiple choice questions must have at least 2 correct answers",
  path: ["answers"]
});

// Submit Answer Validation Schema
export const submitAnswerSchema = z.object({
  answers: z.array(z.object({
    questionId: z.number().int().positive(),
    selectedAnswerId: z.number().int().positive().optional(),
    selectedAnswerIds: z.array(z.number().int().positive()).optional(),
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
export const createActivationCodeSchema = z.object({
  code: z.string()
    .min(1, 'Activation code cannot be empty')
    .max(50, 'Activation code cannot exceed 50 characters')
    .trim()
    .optional(), // Optional - will be auto-generated if not provided
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  // Support both single studyPackId and array of studyPackIds
  studyPackId: z.number()
    .int('Study pack ID must be an integer')
    .positive('Study pack ID must be positive')
    .optional(),
  studyPackIds: z.array(
    z.number().int('Study pack ID must be an integer').positive('Study pack ID must be positive')
  )
    .min(1, 'At least one study pack must be selected')
    .optional(),
  // Support both expiryDate and expiresAt
  expiryDate: z.string()
    .datetime('Invalid expiry date format')
    .optional(),
  expiresAt: z.string()
    .datetime('Invalid expiry date format')
    .optional(),
  maxUses: z.number()
    .int('Max uses must be an integer')
    .min(1, 'Max uses must be at least 1')
    .optional(),
  // Support both duration types
  durationType: z.enum(['MONTHS', 'DAYS']).default('MONTHS'),
  durationMonths: z.number()
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 month')
    .max(60, 'Duration cannot exceed 60 months')
    .optional(),
  durationDays: z.number()
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 day')
    .max(1825, 'Duration cannot exceed 1825 days')
    .optional(),
  isActive: z.boolean().default(true)
}).refine((data) => {
  // Require either studyPackId or studyPackIds
  return data.studyPackId !== undefined || (data.studyPackIds !== undefined && data.studyPackIds.length > 0);
}, {
  message: 'Either studyPackId or studyPackIds must be provided',
  path: ['studyPackId']
});

// Update Activation Code Validation (Canonical spec - all fields optional)
export const updateActivationCodeSchema = z.object({
  code: z.string()
    .min(1, 'Activation code cannot be empty')
    .max(50, 'Activation code cannot exceed 50 characters')
    .trim()
    .optional(),
  studyPackId: z.number()
    .int('Study pack ID must be an integer')
    .positive('Study pack ID must be positive')
    .optional(),
  expiryDate: z.string()
    .datetime('Invalid expiry date format')
    .optional(),
  maxUses: z.number()
    .int('Max uses must be an integer')
    .min(1, 'Max uses must be at least 1')
    .optional(),
  durationMonths: z.number()
    .int('Duration must be an integer')
    .min(1, 'Duration must be at least 1 month')
    .optional(),
  isActive: z.boolean().optional()
});

// Get Activation Codes Filters Validation (Canonical spec)
export const getActivationCodesSchema = z.object({
  page: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, { message: 'Page must be a positive number' }),
  limit: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val > 0 && val <= 100, {
      message: 'Limit must be between 1 and 100'
    }),
  isActive: z.string()
    .optional()
    .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined),
  search: z.string()
    .max(100, 'Search term cannot exceed 100 characters')
    .optional(),
  studyPackId: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .refine((val) => val === undefined || val > 0, {
      message: 'Study pack ID must be a positive number'
    }),
  expiryDate: z.string()
    .datetime('Invalid expiry date format')
    .optional()
});

// Validate Activation Code (Student) Validation
export const validateActivationCodeSchema = z.object({
  code: z.string()
    .min(8, 'Activation code must be at least 8 characters')
    .max(32, 'Activation code cannot exceed 32 characters')
    .regex(/^[A-Z0-9-]+$/, 'Activation code can only contain uppercase letters, numbers, and hyphens')
    .transform((val) => val.toUpperCase().trim())
});

// ==========================================
// RESIDENCY QUESTION MANAGEMENT (Canonical spec)
// ==========================================

// Answer schema for residency questions
const residencyQuestionAnswerSchema = z.object({
  answerText: z.string().min(1, 'Answer text is required'),
  isCorrect: z.boolean()
});

// Create Residency Question Validation
export const createResidencyQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required'),
  part: z.enum(['PART_1', 'PART_2'], { errorMap: () => ({ message: 'Part must be PART_1 or PART_2' }) }),
  explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
  examYear: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  metadata: z.string().optional(),
  tags: z.array(z.string()).optional(),
  repetitionCount: z.number().int().min(0).optional(),
  repetitionYears: z.array(z.number().int()).optional(),
  questionAnswers: z.array(residencyQuestionAnswerSchema)
    .min(1, 'At least one answer is required')
    .refine(
      (answers) => answers.some(a => a.isCorrect),
      { message: 'At least one answer must be marked as correct' }
    )
});

// Update Residency Question Validation (all fields optional)
export const updateResidencyQuestionSchema = z.object({
  questionText: z.string().min(1).optional(),
  part: z.enum(['PART_1', 'PART_2']).optional(),
  explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
  examYear: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  metadata: z.string().optional(),
  tags: z.array(z.string()).optional(),
  repetitionCount: z.number().int().min(0).optional(),
  repetitionYears: z.array(z.number().int()).optional(),
  questionAnswers: z.array(residencyQuestionAnswerSchema)
    .min(1)
    .refine(
      (answers) => answers.some(a => a.isCorrect),
      { message: 'At least one answer must be marked as correct' }
    )
    .optional()
});

// Query params for listing residency questions
export const residencyQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  part: z.enum(['PART_1', 'PART_2']).optional(),
  examYear: z.coerce.number().int().positive().optional(),
  universityId: z.coerce.number().int().positive().optional(),
  search: z.string().optional()
});

// Bulk Create Residency Questions Validation
export const bulkCreateResidencyQuestionsSchema = z.object({
  universityId: z.number().int().positive('University ID must be a positive integer'),
  examYear: z.number().int().positive('Exam year must be a positive integer'),
  part: z.string().min(1, 'Part is required'),
  questions: z.array(z.object({
    questionText: z.string().min(1, 'Question text is required'),
    explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined),
    metadata: z.string().optional(),
    questionAnswers: z.array(z.object({
      answerText: z.string().min(1, 'Answer text is required'),
      isCorrect: z.boolean(),
      explanation: z.string().optional().transform(val => val ? sanitizeMarkdown(val) : undefined)
    }))
      .min(1, 'At least one answer is required')
      .refine(
        (answers) => answers.some(a => a.isCorrect),
        { message: 'At least one answer must be marked as correct' }
      )
  })).min(1, 'At least one question is required')
});