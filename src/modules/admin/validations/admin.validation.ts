import { z } from 'zod';
import { UserRole, YearLevel, PackType, QuizType, ResourceType, SubscriptionStatus, RetakeType, ReportStatus } from '@prisma/client';
import { QuestionType } from '../../../types/quiz.types';
import { markdownSchema, httpUrlSchema, httpUrlOrPathSchema } from '../../../middleware/validation.middleware';

// User Management Validations
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  role: z.nativeEnum(UserRole),
  universityId: z.number().int().positive().optional(),
  specialtyId: z.number().int().positive().optional(),
  currentYear: z.nativeEnum(YearLevel).optional(),
});

export const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
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
  // Rendered as an image source: http(s) URL or a /api/v1/media/... path
  logoUrl: httpUrlOrPathSchema('Logo URL must be an http(s) URL or a /path').optional(),
});

// Used for create and update (PUT /admin/content/modules/:moduleId)
export const createModuleSchema = z.object({
  uniteId: z.number().int().positive().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  // Module image: the url POST /admin/upload/logo returns (or any http(s) URL); null removes it.
  // logoUrl is accepted as an alias, like unites use.
  imagePath: httpUrlOrPathSchema('Image path must be an http(s) URL or a /path').nullable().optional(),
  logoUrl: httpUrlOrPathSchema('Logo URL must be an http(s) URL or a /path').nullable().optional(),
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
  tag: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  filePath: z.string().optional(),
  externalUrl: httpUrlSchema('External URL must be an http(s) URL').optional(),
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
    explanation: markdownSchema(),
    questionType: z.nativeEnum(QuestionType).optional().default(QuestionType.SINGLE_CHOICE),
    answers: z.array(z.object({
      answerText: z.string().min(1),
      isCorrect: z.boolean(),
      explanation: markdownSchema(),
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
  explanation: markdownSchema(),
  questionType: z.nativeEnum(QuestionType).optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
  answers: z.array(z.object({
    answerText: z.string().min(1),
    isCorrect: z.boolean(),
    explanation: markdownSchema(),
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
    explanation: markdownSchema(),
    answers: z.array(z.object({
      answerText: z.string().min(1),
      isCorrect: z.boolean(),
      explanation: markdownSchema(),
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
// Body: { status, adminNotes }. The older client shape { action, response } is mapped to it.
export const reviewQuestionReportSchema = z.preprocess(
  (body: any) => {
    if (body && typeof body === 'object' && body.status === undefined && body.action !== undefined) {
      const { action, response, ...rest } = body;
      return { ...rest, status: action, adminNotes: rest.adminNotes ?? response };
    }
    return body;
  },
  z.object({
    status: z.nativeEnum(ReportStatus, {
      errorMap: () => ({ message: `Status must be one of ${Object.values(ReportStatus).join(', ')}` })
    }),
    adminNotes: z.string().max(1000, 'Admin notes cannot exceed 1000 characters').optional(),
  })
);

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
  explanation: markdownSchema(),
  questionType: z.nativeEnum(QuestionType).optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(), // NEW: Optional metadata field
  answers: z.array(z.object({
    id: z.number().int().positive().optional(), // For existing answers
    answerText: z.string().min(1),
    isCorrect: z.boolean(),
    explanation: markdownSchema(),
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

// Activation codes are stored upper-case, 8-32 characters of A-Z, 0-9 and '-': the
// format students can redeem (validateActivationCodeSchema)
const ACTIVATION_CODE_FORMAT = /^[A-Z0-9-]{8,32}$/;
const activationCodeSchema = z.string()
  .trim()
  .transform(value => value.toUpperCase())
  .pipe(z.string().regex(
    ACTIVATION_CODE_FORMAT,
    'Activation code must be 8-32 characters: letters, numbers and hyphens'
  ));

// Create Activation Code Validation (Canonical spec)
// Supports both legacy (code, studyPackId) and new format (studyPackIds, expiresAt)
export const createActivationCodeSchema = z.object({
  code: activationCodeSchema.optional(), // Optional - will be auto-generated if not provided
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
  code: activationCodeSchema.optional(),
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .nullable()
    .optional(),
  // Replaces the code's study packs (studyPackIds wins over the legacy single studyPackId)
  studyPackId: z.number()
    .int('Study pack ID must be an integer')
    .positive('Study pack ID must be positive')
    .optional(),
  studyPackIds: z.array(
    z.number().int('Study pack ID must be an integer').positive('Study pack ID must be positive')
  )
    .min(1, 'At least one study pack must be selected')
    .optional(),
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
  durationType: z.enum(['MONTHS', 'DAYS']).optional(),
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

// Validate Activation Code (Student) Validation: case-insensitive, like the stored codes
export const validateActivationCodeSchema = z.object({
  code: z.string()
    .trim()
    .transform((val) => val.toUpperCase())
    .pipe(z.string()
      .min(8, 'Activation code must be at least 8 characters')
      .max(32, 'Activation code cannot exceed 32 characters')
      .regex(/^[A-Z0-9-]+$/, 'Activation code can only contain letters, numbers, and hyphens'))
});

// ==========================================
// RESIDENCY QUESTION MANAGEMENT (Canonical spec)
// ==========================================

// The three residency exam parts. Questions are only listed, editable and used in
// student sessions when their part is one of these.
export const RESIDENCY_PARTS = ['Sciences_fondamentales', 'Pathologie_medico_chirurgical', 'Dossier_clinique'] as const;

// Labels older admin screens send, keyed by a normalized form (lower case, no accents,
// runs of other characters as '_')
const RESIDENCY_PART_ALIASES: Record<string, typeof RESIDENCY_PARTS[number]> = {
  sciences_fondamentales: 'Sciences_fondamentales',
  e_sciences_fondamentales: 'Sciences_fondamentales',
  pathologie_medico_chirurgical: 'Pathologie_medico_chirurgical',
  pathologie_medico_chirurgicale: 'Pathologie_medico_chirurgical',
  pathologies_medico_chirurgicales: 'Pathologie_medico_chirurgical',
  e_pathologies_m_c: 'Pathologie_medico_chirurgical',
  dossier_clinique: 'Dossier_clinique',
  dossiers_cliniques: 'Dossier_clinique',
  e_dossiers_cliniques: 'Dossier_clinique',
};

export function normalizeResidencyPart(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return RESIDENCY_PART_ALIASES[key] ?? value;
}

const residencyPartSchema = z.preprocess(
  normalizeResidencyPart,
  z.enum(RESIDENCY_PARTS, {
    errorMap: () => ({ message: `Part must be one of ${RESIDENCY_PARTS.join(', ')}` })
  })
);

// Answer schema for residency questions. On update, an answer with an id edits that
// answer; answers without an id are added; existing answers left out are removed.
const residencyQuestionAnswerSchema = z.object({
  id: z.number().int().positive().optional(),
  answerText: z.string().min(1, 'Answer text is required'),
  isCorrect: z.boolean()
});

// Create Residency Question Validation
export const createResidencyQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required'),
  part: residencyPartSchema,
  explanation: markdownSchema(),
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
  part: residencyPartSchema.optional(),
  explanation: markdownSchema(),
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
  part: z.preprocess(normalizeResidencyPart, z.string().optional()),
  examYear: z.coerce.number().int().positive().optional(),
  universityId: z.coerce.number().int().positive().optional(),
  search: z.string().optional()
});

// Bulk Create Residency Questions Validation
export const bulkCreateResidencyQuestionsSchema = z.object({
  universityId: z.number().int().positive('University ID must be a positive integer'),
  examYear: z.number().int().positive('Exam year must be a positive integer'),
  part: residencyPartSchema,
  questions: z.array(z.object({
    questionText: z.string().min(1, 'Question text is required'),
    explanation: markdownSchema(),
    metadata: z.string().optional(),
    questionAnswers: z.array(z.object({
      answerText: z.string().min(1, 'Answer text is required'),
      isCorrect: z.boolean(),
      explanation: markdownSchema()
    }))
      .min(1, 'At least one answer is required')
      .refine(
        (answers) => answers.some(a => a.isCorrect),
        { message: 'At least one answer must be marked as correct' }
      )
  })).min(1, 'At least one question is required')
});

// Module / sub-module books (POST /admin/modules/:id/books, /admin/sub-modules/:id/books).
// viewUrl and coverPath are rendered as links and images: http(s) URLs or /paths only.
export const createBooksSchema = z.object({
  books: z.array(z.object({
    name: z.string().trim().min(1, 'Book name is required').max(255, 'Book name cannot exceed 255 characters'),
    coverPath: httpUrlOrPathSchema('Cover path must be an http(s) URL or a /path').optional(),
    viewUrl: httpUrlOrPathSchema('View URL must be an http(s) URL or a /path'),
    tag: z.string().trim().max(100, 'Tag cannot exceed 100 characters').optional(),
  })).min(1, 'Books array is required and cannot be empty').max(500, 'Cannot create more than 500 books at once'),
});
