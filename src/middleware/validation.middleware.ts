import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { SessionType, SessionStatus, YearLevel, ResourceType, QuizType, RetakeType } from '@prisma/client';
import { QuestionType } from '../types/quiz.types';
import { BadRequestError } from '../core/errors/AppError';
import { InvalidQuizConfigurationError, InvalidFilterError } from '../core/errors/QuizErrors';
import { RequestWithUser } from '../types/types';
import { AccessControlService } from '../services/access-control.service';

// Common ID schema
export const idSchema = z.coerce.number().int().positive();
const MAX_SESSION_QUESTIONS = 1000;

// Enhanced validation schemas with more strict rules
export const createQuizSessionSchema = z.object({
  title: z.string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must not exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, "Title contains invalid characters"),

  // NEW: allow setting the session type explicitly (defaults handled in service)
  type: z.nativeEnum(SessionType).optional(),

  quizType: z.nativeEnum(QuizType).optional(), // QCM/QCS support

  settings: z.object({
    questionCount: z.number()
      .int("Question count must be an integer")
      .min(1, "Question count must be at least 1")
      .max(MAX_SESSION_QUESTIONS, `Question count cannot exceed ${MAX_SESSION_QUESTIONS}`)
  }),

  filters: z.object({
    yearLevels: z.array(z.nativeEnum(YearLevel))
      .optional()
      .refine(arr => !arr || arr.length <= 7, "Cannot select more than 7 year levels"),

    uniteIds: z.array(z.number().int().positive("Invalid unite ID"))
      .optional()
      .refine(arr => !arr || arr.length <= 10, "Cannot select more than 10 unites"),

    moduleIds: z.array(z.number().int().positive("Invalid module ID"))
      .optional()
      .refine(arr => !arr || arr.length <= 20, "Cannot select more than 20 modules"),

    courseIds: z.array(z.number().int().positive("Invalid course ID"))
      .optional()
      .refine(arr => !arr || arr.length <= 50, "Cannot select more than 50 courses"),

    questionTypes: z.array(z.nativeEnum(QuestionType))
      .optional()
      .refine(arr => !arr || arr.length <= 2, "Cannot select more than 2 question types")
      .refine(arr => !arr || arr.length > 0, "Question types array cannot be empty if provided"),

    examYears: z.array(z.number().int().min(1900, "Exam year must be 1900 or later").max(new Date().getFullYear() + 10, "Exam year cannot be more than 10 years in the future"))
      .optional()
      .refine(arr => !arr || arr.length <= 20, "Cannot select more than 20 exam years")
      .refine(arr => !arr || arr.length > 0, "Exam years array cannot be empty if provided"),

    quizSourceIds: z.array(z.number().int().positive("Invalid quiz source ID"))
      .optional()
      .refine(arr => !arr || arr.length <= 10, "Cannot select more than 10 quiz sources")
      .refine(arr => !arr || arr.length > 0, "Quiz source IDs array cannot be empty if provided")
  }).refine(filters => {
    // At least one filter must be provided (excluding the new optional filters)
    return filters.yearLevels?.length ||
      filters.uniteIds?.length ||
      filters.moduleIds?.length ||
      filters.courseIds?.length ||
      filters.questionTypes?.length ||
      filters.examYears?.length ||
      filters.quizSourceIds?.length;
  }, "At least one filter must be provided")
});

// Custom validation middleware for quiz session creation with intelligent year level handling
export function validateQuizSessionRequest() {
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      // First validate the basic structure
      const validation = createQuizSessionSchema.safeParse(req.body);

      if (!validation.success) {
        const errors = validation.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }));

        throw new BadRequestError(`Validation failed: ${errors.map(e => e.message).join(', ')}`);
      }

      let validatedData = validation.data;

      // Handle year level filtering based on user's subscription type
      if (!validatedData.filters.yearLevels || validatedData.filters.yearLevels.length === 0) {
        if (!req.user) {
          throw new BadRequestError("User authentication required");
        }

        const accessControlService = new AccessControlService();
        const defaultYearLevels = accessControlService.getDefaultYearLevelsForFiltering(req.user);

        // Only apply year level filtering if we have specific levels to filter by
        if (defaultYearLevels.length > 0) {
          validatedData.filters.yearLevels = defaultYearLevels;
        }
        // If defaultYearLevels is empty (e.g., for residency subscribers), don't add year level filtering
      } else {
        // If year levels are explicitly provided, validate user has access to them
        if (req.user) {
          const accessControlService = new AccessControlService();
          const hasAccess = accessControlService.validateYearLevelAccess(req.user, validatedData.filters.yearLevels);

          if (!hasAccess) {
            throw new InvalidFilterError("yearLevels", "You don't have access to one or more of the specified year levels");
          }
        }
      }

      // Replace request body with validated and enhanced data
      req.body = validatedData;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const createExamSessionSchema = z.object({
  examId: z.number()
    .int("Exam ID must be an integer")
    .positive("Exam ID must be positive")
});

export const createSessionByQuestionsSchema = z.object({

  title: z.string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must not exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, "Title contains invalid characters"),
  type: z.enum(['PRACTICE', 'EXAM'], {
    errorMap: () => ({ message: "Type must be either 'PRACTICE' or 'EXAM'" })
  }),
  questionIds: z.array(z.number().int().positive("Question ID must be a positive integer"))
    .min(1, "At least one question ID must be provided")
    .max(MAX_SESSION_QUESTIONS, `Cannot create session with more than ${MAX_SESSION_QUESTIONS} questions`)
    .refine(arr => new Set(arr).size === arr.length, "Question IDs must be unique")
});

export const questionCountQuerySchema = z.object({
  unite: z.coerce.number().int().positive("Unite ID must be a positive integer").optional(),
  module: z.coerce.number().int().positive("Module ID must be a positive integer").optional(),
  university: z.coerce.number().int().positive("University ID must be a positive integer").optional(),
  year: z.coerce.number().int().positive("Year must be a positive integer").optional()
});

// Canonical spec: POST /quizzes/question-count
export const canonicalQuestionCountSchema = z.object({
  courseIds: z.array(z.number().int().positive()).min(1, "At least one courseId is required"),
  questionTypes: z.array(z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "QROC"])).optional(),
  years: z.array(z.number().int().positive()).optional(),
  // Rotations are the questions' year levels: the values GET /quizzes/session-filters returns
  rotations: z.array(z.nativeEnum(YearLevel)).optional(),
  universityIds: z.array(z.number().int().positive()).optional(),
  questionSourceIds: z.array(z.number().int().positive()).optional(),
  repetitionCountMin: z.number().int().min(0, "Repetition count must be non-negative").optional(),
  repetitionYears: z.array(z.number().int().positive()).optional()
});

// Canonical spec: POST /quizzes/sessions
export const canonicalCreateSessionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
  courseIds: z.array(z.number().int().positive()).min(1, "At least one courseId is required"),
  sessionType: z.enum(["PRACTISE", "EXAM"]),
  questionCount: z.number().int().min(1, "Question count must be at least 1").max(MAX_SESSION_QUESTIONS, `Question count cannot exceed ${MAX_SESSION_QUESTIONS}`).optional(),
  questionTypes: z.array(z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "QROC"])).optional(),
  years: z.array(z.number().int().positive()).optional(),
  // Rotations are the questions' year levels: the values GET /quizzes/session-filters returns
  rotations: z.array(z.nativeEnum(YearLevel)).optional(),
  universityIds: z.array(z.number().int().positive()).optional(),
  questionSourceIds: z.array(z.number().int().positive()).optional(),
  repetitionCountMin: z.number().int().min(0, "Repetition count must be non-negative").optional(),
  repetitionYears: z.array(z.number().int().positive()).optional()
});

export const submitAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.number().int().positive("Invalid question ID"),
    selectedAnswerId: z.number().int().positive("Invalid answer ID").optional(),
    selectedAnswerIds: z.array(z.number().int().positive("Invalid answer ID")).min(1, "Must select at least one answer for multiple choice").optional(),
    textAnswer: z.string().optional(),
    isCorrect: z.boolean().optional()
  }).refine((data) => {
    // Exactly one of the answer types must be provided
    const hasSingle = data.selectedAnswerId !== undefined;
    const hasMultiple = data.selectedAnswerIds !== undefined && data.selectedAnswerIds.length > 0;
    const hasText = data.textAnswer !== undefined;

    // Count how many methods are present (true)
    const methodsCount = [hasSingle, hasMultiple, hasText].filter(Boolean).length;

    return methodsCount === 1;
  }, {
    message: "Must provide exactly one of: selectedAnswerId (single choice), selectedAnswerIds (multiple choice), or textAnswer"
  })).min(1, "At least one answer must be provided")
    .max(MAX_SESSION_QUESTIONS, `Cannot submit more than ${MAX_SESSION_QUESTIONS} answers at once`)
    .refine(
      answers => new Set(answers.map(answer => answer.questionId)).size === answers.length,
      "Each question can only be answered once per request"
    )
});

export const updateAnswerSchema = z.object({
  selectedAnswerId: z.number().int().positive("Invalid answer ID")
});

// Enhanced pagination schema with stricter validation
export const paginationSchema = z.object({
  page: z.coerce.number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(500, "Page cannot exceed 500 for performance reasons")
    .default(1)
    .refine(val => val > 0, "Page must be a positive number"),

  limit: z.coerce.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit cannot exceed 50 for performance reasons")
    .default(10)
    .refine(val => val > 0, "Limit must be a positive number")
}).passthrough(); // Allow additional properties for filtering

// Admin-specific pagination with higher limits for administrative tasks
export const adminPaginationSchema = z.object({
  page: z.coerce.number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(1000, "Page cannot exceed 1000")
    .default(1)
    .refine(val => val > 0, "Page must be a positive number"),

  limit: z.coerce.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100 for performance reasons")
    .default(10)
    .refine(val => val > 0, "Limit must be a positive number")
}).passthrough(); // Allow additional properties for filtering

// Specialized pagination validation middleware with enhanced error messages
export function validatePagination(useAdminLimits: boolean = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = useAdminLimits ? adminPaginationSchema : paginationSchema;
      const validation = schema.safeParse(req.query);

      if (!validation.success) {
        const errors = validation.error.issues.map(issue => {
          const field = issue.path.join('.') || 'pagination';
          let message = issue.message;

          // Provide more specific error messages for common pagination issues
          if (field === 'page') {
            if (issue.code === 'too_small') {
              const received = (issue as any).received;
              message = `Page number must be at least 1. Received: ${received}`;
            } else if (issue.code === 'too_big') {
              const maxPage = useAdminLimits ? 1000 : 500;
              const received = (issue as any).received;
              message = `Page number cannot exceed ${maxPage} for performance reasons. Received: ${received}`;
            } else if (issue.code === 'invalid_type') {
              const received = (issue as any).received;
              message = `Page must be a valid number. Received: ${typeof received} (${received})`;
            }
          } else if (field === 'limit') {
            if (issue.code === 'too_small') {
              const received = (issue as any).received;
              message = `Limit must be at least 1. Received: ${received}`;
            } else if (issue.code === 'too_big') {
              const maxLimit = useAdminLimits ? 100 : 50;
              const received = (issue as any).received;
              message = `Limit cannot exceed ${maxLimit} for performance reasons. Received: ${received}`;
            } else if (issue.code === 'invalid_type') {
              const received = (issue as any).received;
              message = `Limit must be a valid number. Received: ${typeof received} (${received})`;
            }
          }

          return {
            field,
            message,
            code: issue.code,
            received: (issue as any).received
          };
        });

        const errorMessage = `Pagination validation failed: ${errors.map(e => e.message).join(', ')}`;
        const maxPage = useAdminLimits ? 1000 : 500;
        const maxLimit = useAdminLimits ? 100 : 50;

        throw new BadRequestError(errorMessage, {
          errors,
          hint: `Valid pagination parameters: page (1-${maxPage}), limit (1-${maxLimit})`,
          examples: {
            valid: "?page=1&limit=10",
            invalid: ["?page=0&limit=10", "?page=1&limit=1000", "?page=abc&limit=xyz"]
          }
        });
      }

      // Replace request query with validated data
      (req.query as any) = { ...req.query, ...validation.data };
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Enhanced generic validation middleware factory with better error messages
export function validateRequest<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = schema.safeParse(req.body);

      if (!validation.success) {
        const errors = validation.error.issues.map(issue => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
          code: issue.code,
          received: 'received' in issue ? issue.received : undefined,
          expected: 'expected' in issue ? issue.expected : undefined
        }));

        // Create more descriptive error message with field-specific details
        const errorDetails = errors.map(e => {
          let detail = `${e.field}: ${e.message}`;
          if (e.received !== undefined) {
            detail += ` (received: ${JSON.stringify(e.received)})`;
          }
          if (e.expected !== undefined) {
            detail += ` (expected: ${e.expected})`;
          }
          return detail;
        }).join('; ');

        const errorMessage = errors.length > 0
          ? `Request validation failed: ${errorDetails}`
          : 'Request validation failed: Unknown error';

        throw new BadRequestError(errorMessage, {
          errors,
          hint: "Please ensure all required fields are provided with correct data types and formats"
        });
      }

      // Replace request body with validated data
      req.body = validation.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Enhanced query parameter validation middleware with better error messages
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = schema.safeParse(req.query);

      if (!validation.success) {
        const errors = validation.error.issues.map(issue => ({
          field: issue.path.join('.') || 'query',
          message: issue.message,
          code: issue.code,
          received: 'received' in issue ? issue.received : undefined,
          expected: 'expected' in issue ? issue.expected : undefined
        }));

        // Create more descriptive error message
        const errorDetails = errors.map(e => {
          let detail = `${e.field}: ${e.message}`;
          if (e.received !== undefined) {
            detail += ` (received: ${e.received})`;
          }
          return detail;
        }).join(', ');

        throw new BadRequestError(`Query parameter validation failed: ${errorDetails}`, {
          errors,
          hint: "Please check the API documentation for valid parameter formats and ranges"
        });
      }

      // Replace request query with validated data
      req.query = validation.data as any;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Parameter validation middleware
export function validateParams(paramSchema: Record<string, ZodSchema>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedParams: any = {};

      for (const [key, schema] of Object.entries(paramSchema)) {
        const validation = schema.safeParse(req.params[key]);

        if (!validation.success) {
          throw new BadRequestError(`Invalid ${key}: ${validation.error.issues[0].message}`);
        }

        validatedParams[key] = validation.data;
      }

      req.params = { ...req.params, ...validatedParams };
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Sanitization utilities
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '';

  return str
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 1000); // Limit length
}

/** Longest markdown text (explanations) accepted; schemas reject longer input with a 400 */
export const MAX_MARKDOWN_LENGTH = 20000;

export function sanitizeMarkdown(str: string): string {
  if (typeof str !== 'string') return '';

  return str
    .trim()
    // Remove control characters, keeping tab, line feed and carriage return (markdown needs them)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_MARKDOWN_LENGTH); // Schemas enforce the limit first; this is a backstop
}

/** Optional markdown field: over-long input is rejected, then sanitized */
export const markdownSchema = () => z.string()
  .max(MAX_MARKDOWN_LENGTH, `Text cannot exceed ${MAX_MARKDOWN_LENGTH} characters`)
  .optional()
  .transform(val => val ? sanitizeMarkdown(val) : undefined);

/** True for absolute http:// or https:// URLs only (no javascript:, data:, etc.) */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * True for http(s) URLs and for site-relative paths such as the
 * /api/v1/media/... URLs the upload routes return (not protocol-relative //host)
 */
export function isHttpUrlOrPath(value: string): boolean {
  if (/^\/(?![\/\\])/.test(value)) {
    return !/[\s\\]/.test(value);
  }
  return isHttpUrl(value);
}

/** A link rendered to users: must be an http(s) URL */
export const httpUrlSchema = (message = 'Only http(s) URLs are allowed') => z.string()
  .trim()
  .max(2048, 'URL is too long')
  .refine(isHttpUrl, message);

/** A media link rendered to users: an http(s) URL or a site-relative /path */
export const httpUrlOrPathSchema = (message = 'Only http(s) URLs or /paths are allowed') => z.string()
  .trim()
  .max(2048, 'URL is too long')
  .refine(isHttpUrlOrPath, message);



export function sanitizeId(id: any): number | null {
  const parsed = parseInt(id, 10);
  return (!isNaN(parsed) && parsed > 0) ? parsed : null;
}

// Rate limiting specific validation
export const rateLimitSchema = z.object({
  windowMs: z.number().min(1000).max(3600000), // 1 second to 1 hour
  maxRequests: z.number().min(1).max(1000),
  skipSuccessfulRequests: z.boolean().optional().default(false)
});

// Custom error formatter for better API responses
export function formatValidationError(error: ZodError): {
  message: string;
  errors: Array<{
    field: string;
    message: string;
    received?: any;
  }>;
} {
  return {
    message: "Validation failed",
    errors: error.issues.map(issue => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      ...(issue.code === 'invalid_type' && { received: issue.received })
    }))
  };
}

// ===============================================
// STUDENT SESSION FILTERING VALIDATION SCHEMAS
// ===============================================

// Schema for session results filtering query parameters
export const sessionResultsQuerySchema = z.object({
  // Answer type filter
  answerType: z.enum(['correct', 'incorrect', 'all'], {
    errorMap: () => ({ message: "Answer type must be 'correct', 'incorrect', or 'all'" })
  }).optional().default('all'),

  // Session type filter
  sessionType: z.nativeEnum(SessionType, {
    errorMap: () => ({ message: "Session type must be 'PRACTICE' or 'EXAM'" })
  }).optional(),

  // Multiple session IDs - support both comma-separated and array formats
  sessionIds: z.union([
    z.string().transform(str => str.split(',').map(id => parseInt(id.trim(), 10))),
    z.array(z.string()).transform(arr => arr.map(id => parseInt(id, 10))),
    z.array(z.number().int().positive())
  ]).optional().refine(
    (ids) => !ids || ids.every(id => !isNaN(id) && id > 0),
    "All session IDs must be positive integers"
  ).refine(
    (ids) => !ids || ids.length <= 50,
    "Cannot filter by more than 50 sessions at once"
  ),

  // Specific exam/quiz filters
  examId: z.coerce.number()
    .int("Exam ID must be an integer")
    .positive("Exam ID must be positive")
    .optional(),

  quizId: z.coerce.number()
    .int("Quiz ID must be an integer")
    .positive("Quiz ID must be positive")
    .optional(),

  // Date range filters
  completedAfter: z.string()
    .datetime("Completed after date must be in ISO format")
    .transform(str => new Date(str))
    .optional(),

  completedBefore: z.string()
    .datetime("Completed before date must be in ISO format")
    .transform(str => new Date(str))
    .optional(),

  // Pagination
  page: z.coerce.number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(1000, "Page cannot exceed 1000")
    .default(1),

  limit: z.coerce.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20)
}).refine(
  (data) => !data.examId || !data.quizId,
  "Cannot filter by both exam ID and quiz ID simultaneously"
).refine(
  (data) => !data.completedAfter || !data.completedBefore || data.completedAfter <= data.completedBefore,
  "Completed after date must be before completed before date"
);

// Schema for available sessions query parameters
export const availableSessionsQuerySchema = z.object({
  sessionType: z.nativeEnum(SessionType, {
    errorMap: () => ({ message: "Session type must be 'PRACTICE' or 'EXAM'" })
  }).optional()
});

// Schema for session status update
export const updateSessionStatusSchema = z.object({
  status: z.nativeEnum(SessionStatus, {
    errorMap: () => ({ message: "Status must be 'NOT_STARTED', 'IN_PROGRESS', or 'COMPLETED'" })
  })
});

// Schema for quiz history query parameters (enhanced version)
export const quizHistoryQuerySchema = z.object({
  type: z.nativeEnum(SessionType, {
    errorMap: () => ({ message: "Type must be 'PRACTICE' or 'EXAM'" })
  }).optional(),

  page: z.coerce.number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(1000, "Page cannot exceed 1000")
    .default(1),

  limit: z.coerce.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit cannot exceed 50")
    .default(10)
});

// Schema for note creation with optional quiz/question association
export const createNoteSchema = z.object({
  noteText: z.string()
    .trim()
    .min(1, "Note text cannot be empty")
    .max(2000, "Note text cannot exceed 2000 characters"),

  questionId: z.coerce.number()
    .int("Question ID must be an integer")
    .positive("Question ID must be positive")
    .optional(),

  quizId: z.coerce.number()
    .int("Quiz ID must be an integer")
    .positive("Quiz ID must be positive")
    .optional()
});

// Schema for note updates
export const updateNoteSchema = z.object({
  noteText: z.string()
    .trim()
    .min(1, "Note text cannot be empty")
    .max(2000, "Note text cannot exceed 2000 characters")
});

// Schema for label creation
export const createLabelSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Label name cannot be empty")
    .max(50, "Label name cannot exceed 50 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Label name contains invalid characters")
});

// Schema for todo creation
export const createTodoSchema = z.object({
  title: z.string()
    .trim()
    .min(1, "Todo title cannot be empty")
    .max(100, "Todo title cannot exceed 100 characters"),

  description: z.string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional(),

  type: z.enum(['STUDY', 'REVIEW', 'PRACTICE', 'OTHER'], {
    errorMap: () => ({ message: "Type must be one of: STUDY, REVIEW, PRACTICE, OTHER" })
  }).optional(),

  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
    errorMap: () => ({ message: "Priority must be one of: LOW, MEDIUM, HIGH, URGENT" })
  }).optional(),

  dueDate: z.string()
    .datetime("Due date must be in ISO format")
    .transform(str => new Date(str))
    .optional(),

  courseId: z.coerce.number()
    .int("Course ID must be an integer")
    .positive("Course ID must be positive")
    .optional(),

  quizId: z.coerce.number()
    .int("Quiz ID must be an integer")
    .positive("Quiz ID must be positive")
    .optional()
});

// Schema for question report creation (canonical spec)
export const createQuestionReportSchema = z.object({
  reportType: z.enum(['INCORRECT_ANSWER', 'TYPO', 'UNCLEAR_QUESTION', 'MISSING_INFO', 'OTHER'], {
    errorMap: () => ({ message: "Report type must be one of: INCORRECT_ANSWER, TYPO, UNCLEAR_QUESTION, MISSING_INFO, OTHER" })
  }),

  description: z.string()
    .trim()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
});

// Course analytics query schema
export const courseAnalyticsQuerySchema = z.object({
  sessionId: z.coerce.number()
    .int("Session ID must be an integer")
    .positive("Session ID must be positive")
    .optional(),

  sessionType: z.nativeEnum(SessionType, {
    errorMap: () => ({ message: "Session type must be 'PRACTICE', 'EXAM', or 'MOCK'" })
  }).optional(),

  page: z.coerce.number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(1000, "Page cannot exceed 1000")
    .default(1),

  limit: z.coerce.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit cannot exceed 50")
    .default(20)
});

// Student questions query schema
export const studentQuestionsQuerySchema = z.object({
  // Filtering options
  universityIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  yearLevels: z.string().optional().transform((val) =>
    val ? val.split(',').map(level => level.trim()).filter(level =>
      ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'].includes(level)
    ) : undefined
  ),
  courseIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  moduleIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  uniteIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  examYears: z.string().optional().transform((val) =>
    val ? val.split(',').map(year => parseInt(year.trim())).filter(year => !isNaN(year) && year >= 2000 && year <= 2100) : undefined
  ),
  questionTypes: z.string().optional().transform((val) =>
    val ? val.split(',').map(type => type.trim()).filter(type =>
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC'].includes(type)
    ) : undefined
  ),
  examIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  quizSourceIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),
  questionSourceIds: z.string().optional().transform((val) =>
    val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined
  ),

  // Question count and pagination
  count: z.coerce.number().int().min(1).max(100).optional().default(20),

  // Include metadata options
  includeAnswers: z.coerce.boolean().optional().default(false),
  includeExplanations: z.coerce.boolean().optional().default(false),
  includeImages: z.coerce.boolean().optional().default(false),

  // Randomization
  randomize: z.coerce.boolean().optional().default(true)
});

// ===============================================
// VALIDATION MIDDLEWARE HELPERS
// ===============================================

/**
 * Enhanced query validation that handles complex transformations
 */
export function validateComplexQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Handle array parameters that might come as strings
      const processedQuery = { ...req.query };

      // Convert sessionIds parameter to proper format if it exists
      if (processedQuery.sessionIds) {
        if (typeof processedQuery.sessionIds === 'string') {
          processedQuery.sessionIds = processedQuery.sessionIds.split(',');
        }
      }

      const validation = schema.safeParse(processedQuery);

      if (!validation.success) {
        const formattedError = formatValidationError(validation.error);
        return res.status(400).json({
          success: false,
          message: formattedError.message,
          errors: formattedError.errors
        });
      }

      // Replace request query with validated and transformed data
      req.query = validation.data as any;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Sanitize and validate student notes to prevent XSS
 */
export function sanitizeNoteText(noteText: string): string {
  return noteText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

// ===============================================
// ADMIN/EMPLOYEE CONTENT MANAGEMENT SCHEMAS
// ===============================================

// Course creation schema
export const courseSchema = z.object({
  name: z.string()
    .trim()
    .min(3, "Course name must be at least 3 characters")
    .max(150, "Course name cannot exceed 150 characters"),

  description: z.string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .optional(),

  moduleId: z.number()
    .int("Module ID must be an integer")
    .positive("Module ID must be positive")
});

// Course resource schema
export const resourceSchema = z.object({
  type: z.nativeEnum(ResourceType),

  title: z.string()
    .trim()
    .min(1, "Resource title must be at least 2 characters")
    .max(200, "Resource title cannot exceed 200 characters"),

  tag: z.string()
    .trim()
    .min(1, "Tag cannot be empty")
    .max(100, "Tag cannot exceed 100 characters")
    .optional(),

  description: z.string()
    .trim()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),

  courseId: z.number()
    .int("Course ID must be an integer")
    .positive("Course ID must be positive"),

  filePath: z.string().optional(),
  // Rendered as a link to admins and students: http(s) only (a javascript: URL would run in their session)
  externalUrl: httpUrlSchema("External URL must be an http(s) URL").optional(),
  youtubeVideoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/, "Invalid YouTube video ID").optional(),

  isPaid: z.boolean().default(false),
  price: z.number().min(0).optional()
});

// Enhanced quiz creation schema for employees
export const employeeQuizSchema = z.object({
  title: z.string()
    .trim()
    .min(5, "Quiz title must be at least 5 characters")
    .max(150, "Quiz title must not exceed 150 characters"),

  description: z.string()
    .trim()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),

  type: z.nativeEnum(QuizType),

  courseId: z.number()
    .int("Course ID must be an integer")
    .positive("Course ID must be positive")
    .optional(),

  universityId: z.number()
    .int("University ID must be an integer")
    .positive("University ID must be positive")
    .optional(),

  yearLevel: z.nativeEnum(YearLevel).optional(),

  quizSourceId: z.number()
    .int("Quiz Source ID must be an integer")
    .positive("Quiz Source ID must be positive")
    .optional(),

  quizYear: z.number()
    .int("Quiz year must be an integer")
    .min(1900, "Quiz year must be 1900 or later")
    .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
    .optional(),

  questions: z.array(z.object({
    questionText: z.string()
      .trim()
      .min(10, "Question text must be at least 10 characters")
      .max(2000, "Question text cannot exceed 2000 characters"),

    explanation: z.string()
      .trim()
      .max(1000, "Explanation cannot exceed 1000 characters")
      .optional(),

    questionType: z.nativeEnum(QuestionType).optional().default(QuestionType.SINGLE_CHOICE),

    answers: z.array(z.object({
      answerText: z.string()
        .trim()
        .min(1, "Answer text cannot be empty")
        .max(500, "Answer text cannot exceed 500 characters"),

      isCorrect: z.boolean(),

      explanation: z.string()
        .trim()
        .max(500, "Answer explanation cannot exceed 500 characters")
        .optional(),

      images: z.array(z.object({
        imagePath: z.string(),
        altText: z.string().optional()
      })).optional()
    }))
      .min(2, "Must have at least 2 answers")
      .max(6, "Cannot have more than 6 answers")
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
  })).min(1, "Must have at least 1 question")
});

// Enhanced exam creation schema
export const employeeExamSchema = z.object({
  title: z.string()
    .trim()
    .min(5, "Exam title must be at least 5 characters")
    .max(200, "Exam title must not exceed 200 characters"),

  description: z.string()
    .trim()
    .max(2000, "Description cannot exceed 2000 characters")
    .optional(),

  moduleId: z.number()
    .int("Module ID must be an integer")
    .positive("Module ID must be positive"),

  universityId: z.number()
    .int("University ID must be an integer")
    .positive("University ID must be positive"),

  yearLevel: z.nativeEnum(YearLevel),

  examYear: z.string()
    .min(4, "Exam year must be at least 4 characters")
    .max(30, "Exam year cannot exceed 30 characters"),

  year: z.number()
    .int("Year must be an integer")
    .min(2000, "Year must be 2000 or later")
    .max(2100, "Year cannot exceed 2100"),

  questions: z.array(z.object({
    questionText: z.string()
      .trim()
      .min(10, "Question text must be at least 10 characters")
      .max(2000, "Question text cannot exceed 2000 characters"),

    explanation: z.string()
      .trim()
      .max(1000, "Explanation cannot exceed 1000 characters")
      .optional(),

    questionType: z.nativeEnum(QuestionType).optional().default(QuestionType.SINGLE_CHOICE),

    answers: z.array(z.object({
      answerText: z.string()
        .trim()
        .min(1, "Answer text cannot be empty")
        .max(500, "Answer text cannot exceed 500 characters"),

      isCorrect: z.boolean(),

      explanation: z.string()
        .trim()
        .max(500, "Answer explanation cannot exceed 500 characters")
        .optional(),

      images: z.array(z.object({
        imagePath: z.string(),
        altText: z.string().optional()
      })).optional()
    }))
      .min(2, "Must have at least 2 answers")
      .max(6, "Cannot have more than 6 answers")
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
    message: "Must have exactly one correct answer",
    path: ["answers"]
  })).min(1, "Must have at least 1 question")
});



// Enhanced quiz session filters with source and year
export const quizSessionFiltersSchema = z.object({
  yearLevels: z.array(z.nativeEnum(YearLevel)).optional(),
  uniteIds: z.array(z.number().int().positive()).optional(),
  moduleIds: z.array(z.number().int().positive()).optional(),
  courseIds: z.array(z.number().int().positive()).optional(),
  quizSourceIds: z.array(z.number().int().positive()).optional(),
  quizYears: z.array(z.number().int().min(1900).max(new Date().getFullYear() + 10)).optional()
});

// Retake Session Validation Schema (POST /quiz-sessions/retake)
export const createRetakeSessionSchema = z.object({
  originalSessionId: z.number()
    .int("Original session ID must be an integer")
    .positive("Original session ID must be positive"),

  retakeType: z.nativeEnum(RetakeType, {
    errorMap: () => ({ message: "Retake type must be SAME, INCORRECT_ONLY, CORRECT_ONLY, or NOT_RESPONDED" })
  }),

  title: z.string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(200, "Title must not exceed 200 characters")
    .optional()
});

// POST /exams/exam-sessions/from-modules
export const examSessionFromModulesSchema = z.object({
  moduleIds: z.array(z.number().int().positive("Invalid module ID"))
    .min(1, "At least one module must be selected")
    .max(20, "Cannot select more than 20 modules"),
  year: z.coerce.number()
    .int("Year must be an integer")
    .min(1900, "Year must be 1900 or later")
    .max(2100, "Year cannot exceed 2100")
});

// Exam Question Ordering Schema
export const updateExamQuestionOrderSchema = z.object({
  examId: z.number()
    .int("Exam ID must be an integer")
    .positive("Exam ID must be positive"),

  questionOrders: z.array(z.object({
    questionId: z.number()
      .int("Question ID must be an integer")
      .positive("Question ID must be positive"),

    orderInExam: z.number()
      .int("Order must be an integer")
      .min(1, "Order must be at least 1")
  })).min(1, "Must provide at least one question order")
});
