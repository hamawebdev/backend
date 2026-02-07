"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExamQuestionOrderSchema = exports.createRetakeSessionSchema = exports.quizSessionFiltersSchema = exports.employeeExamSchema = exports.employeeQuizSchema = exports.resourceSchema = exports.courseSchema = exports.studentQuestionsQuerySchema = exports.courseAnalyticsQuerySchema = exports.createQuestionReportSchema = exports.createTodoSchema = exports.createLabelSchema = exports.updateNoteSchema = exports.createNoteSchema = exports.quizHistoryQuerySchema = exports.updateSessionStatusSchema = exports.availableSessionsQuerySchema = exports.sessionResultsQuerySchema = exports.rateLimitSchema = exports.adminPaginationSchema = exports.paginationSchema = exports.updateAnswerSchema = exports.submitAnswersSchema = exports.canonicalCreateSessionSchema = exports.canonicalQuestionCountSchema = exports.questionCountQuerySchema = exports.createSessionByQuestionsSchema = exports.createExamSessionSchema = exports.createQuizSessionSchema = exports.idSchema = void 0;
exports.validateQuizSessionRequest = validateQuizSessionRequest;
exports.validatePagination = validatePagination;
exports.validateRequest = validateRequest;
exports.validateQuery = validateQuery;
exports.validateParams = validateParams;
exports.sanitizeString = sanitizeString;
exports.sanitizeMarkdown = sanitizeMarkdown;
exports.sanitizeId = sanitizeId;
exports.formatValidationError = formatValidationError;
exports.validateComplexQuery = validateComplexQuery;
exports.sanitizeNoteText = sanitizeNoteText;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const quiz_types_1 = require("../types/quiz.types");
const AppError_1 = require("../core/errors/AppError");
const QuizErrors_1 = require("../core/errors/QuizErrors");
const access_control_service_1 = require("../services/access-control.service");
// Common ID schema
exports.idSchema = zod_1.z.coerce.number().int().positive();
// Enhanced validation schemas with more strict rules
exports.createQuizSessionSchema = zod_1.z.object({
    title: zod_1.z.string()
        .trim()
        .min(3, "Title must be at least 3 characters")
        .max(100, "Title must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, "Title contains invalid characters"),
    // NEW: allow setting the session type explicitly (defaults handled in service)
    type: zod_1.z.nativeEnum(client_1.SessionType).optional(),
    quizType: zod_1.z.nativeEnum(client_1.QuizType).optional(), // QCM/QCS support
    settings: zod_1.z.object({
        questionCount: zod_1.z.number()
            .int("Question count must be an integer")
            .min(1, "Question count must be at least 1")
            .max(100, "Question count cannot exceed 100")
    }),
    filters: zod_1.z.object({
        yearLevels: zod_1.z.array(zod_1.z.nativeEnum(client_1.YearLevel))
            .optional()
            .refine(arr => !arr || arr.length <= 7, "Cannot select more than 7 year levels"),
        uniteIds: zod_1.z.array(zod_1.z.number().int().positive("Invalid unite ID"))
            .optional()
            .refine(arr => !arr || arr.length <= 10, "Cannot select more than 10 unites"),
        moduleIds: zod_1.z.array(zod_1.z.number().int().positive("Invalid module ID"))
            .optional()
            .refine(arr => !arr || arr.length <= 20, "Cannot select more than 20 modules"),
        courseIds: zod_1.z.array(zod_1.z.number().int().positive("Invalid course ID"))
            .optional()
            .refine(arr => !arr || arr.length <= 50, "Cannot select more than 50 courses"),
        questionTypes: zod_1.z.array(zod_1.z.nativeEnum(quiz_types_1.QuestionType))
            .optional()
            .refine(arr => !arr || arr.length <= 2, "Cannot select more than 2 question types")
            .refine(arr => !arr || arr.length > 0, "Question types array cannot be empty if provided"),
        examYears: zod_1.z.array(zod_1.z.number().int().min(1900, "Exam year must be 1900 or later").max(new Date().getFullYear() + 10, "Exam year cannot be more than 10 years in the future"))
            .optional()
            .refine(arr => !arr || arr.length <= 20, "Cannot select more than 20 exam years")
            .refine(arr => !arr || arr.length > 0, "Exam years array cannot be empty if provided"),
        quizSourceIds: zod_1.z.array(zod_1.z.number().int().positive("Invalid quiz source ID"))
            .optional()
            .refine(arr => !arr || arr.length <= 10, "Cannot select more than 10 quiz sources")
            .refine(arr => !arr || arr.length > 0, "Quiz source IDs array cannot be empty if provided")
    }).refine(filters => {
        var _a, _b, _c, _d, _e, _f, _g;
        // At least one filter must be provided (excluding the new optional filters)
        return ((_a = filters.yearLevels) === null || _a === void 0 ? void 0 : _a.length) ||
            ((_b = filters.uniteIds) === null || _b === void 0 ? void 0 : _b.length) ||
            ((_c = filters.moduleIds) === null || _c === void 0 ? void 0 : _c.length) ||
            ((_d = filters.courseIds) === null || _d === void 0 ? void 0 : _d.length) ||
            ((_e = filters.questionTypes) === null || _e === void 0 ? void 0 : _e.length) ||
            ((_f = filters.examYears) === null || _f === void 0 ? void 0 : _f.length) ||
            ((_g = filters.quizSourceIds) === null || _g === void 0 ? void 0 : _g.length);
    }, "At least one filter must be provided")
});
// Custom validation middleware for quiz session creation with intelligent year level handling
function validateQuizSessionRequest() {
    return (req, res, next) => {
        try {
            // First validate the basic structure
            const validation = exports.createQuizSessionSchema.safeParse(req.body);
            if (!validation.success) {
                const errors = validation.error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                    code: issue.code
                }));
                throw new AppError_1.BadRequestError(`Validation failed: ${errors.map(e => e.message).join(', ')}`);
            }
            let validatedData = validation.data;
            // Handle year level filtering based on user's subscription type
            if (!validatedData.filters.yearLevels || validatedData.filters.yearLevels.length === 0) {
                if (!req.user) {
                    throw new AppError_1.BadRequestError("User authentication required");
                }
                const accessControlService = new access_control_service_1.AccessControlService();
                const defaultYearLevels = accessControlService.getDefaultYearLevelsForFiltering(req.user);
                // Only apply year level filtering if we have specific levels to filter by
                if (defaultYearLevels.length > 0) {
                    validatedData.filters.yearLevels = defaultYearLevels;
                }
                // If defaultYearLevels is empty (e.g., for residency subscribers), don't add year level filtering
            }
            else {
                // If year levels are explicitly provided, validate user has access to them
                if (req.user) {
                    const accessControlService = new access_control_service_1.AccessControlService();
                    const hasAccess = accessControlService.validateYearLevelAccess(req.user, validatedData.filters.yearLevels);
                    if (!hasAccess) {
                        throw new QuizErrors_1.InvalidFilterError("yearLevels", "You don't have access to one or more of the specified year levels");
                    }
                }
            }
            // Replace request body with validated and enhanced data
            req.body = validatedData;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
exports.createExamSessionSchema = zod_1.z.object({
    examId: zod_1.z.number()
        .int("Exam ID must be an integer")
        .positive("Exam ID must be positive")
});
exports.createSessionByQuestionsSchema = zod_1.z.object({
    title: zod_1.z.string()
        .trim()
        .min(3, "Title must be at least 3 characters")
        .max(100, "Title must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, "Title contains invalid characters"),
    type: zod_1.z.enum(['PRACTICE', 'EXAM'], {
        errorMap: () => ({ message: "Type must be either 'PRACTICE' or 'EXAM'" })
    }),
    questionIds: zod_1.z.array(zod_1.z.number().int().positive("Question ID must be a positive integer"))
        .min(1, "At least one question ID must be provided")
        .max(100, "Cannot create session with more than 100 questions")
        .refine(arr => new Set(arr).size === arr.length, "Question IDs must be unique")
});
exports.questionCountQuerySchema = zod_1.z.object({
    unite: zod_1.z.coerce.number().int().positive("Unite ID must be a positive integer").optional(),
    module: zod_1.z.coerce.number().int().positive("Module ID must be a positive integer").optional(),
    university: zod_1.z.coerce.number().int().positive("University ID must be a positive integer").optional(),
    year: zod_1.z.coerce.number().int().positive("Year must be a positive integer").optional()
});
// Canonical spec: POST /quizzes/question-count
exports.canonicalQuestionCountSchema = zod_1.z.object({
    courseIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1, "At least one courseId is required"),
    questionTypes: zod_1.z.array(zod_1.z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "QROC"])).optional(),
    years: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    rotations: zod_1.z.array(zod_1.z.enum(["R1", "R2", "R3", "R4"])).optional(),
    universityIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    questionSourceIds: zod_1.z.array(zod_1.z.number().int().positive()).optional()
});
// Canonical spec: POST /quizzes/sessions
exports.canonicalCreateSessionSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1, "Title is required").max(200, "Title too long"),
    courseIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1, "At least one courseId is required"),
    sessionType: zod_1.z.enum(["PRACTISE", "EXAM"]),
    questionCount: zod_1.z.number().int().min(1, "Question count must be at least 1").max(100, "Question count cannot exceed 100").optional(),
    questionTypes: zod_1.z.array(zod_1.z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "QROC"])).optional(),
    years: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    rotations: zod_1.z.array(zod_1.z.enum(["R1", "R2", "R3", "R4"])).optional(),
    universityIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    questionSourceIds: zod_1.z.array(zod_1.z.number().int().positive()).optional()
});
exports.submitAnswersSchema = zod_1.z.object({
    answers: zod_1.z.array(zod_1.z.object({
        questionId: zod_1.z.number().int().positive("Invalid question ID"),
        selectedAnswerId: zod_1.z.number().int().positive("Invalid answer ID").optional(),
        selectedAnswerIds: zod_1.z.array(zod_1.z.number().int().positive("Invalid answer ID")).min(1, "Must select at least one answer for multiple choice").optional(),
        textAnswer: zod_1.z.string().optional(),
        isCorrect: zod_1.z.boolean().optional()
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
        .max(100, "Cannot submit more than 100 answers at once")
});
exports.updateAnswerSchema = zod_1.z.object({
    selectedAnswerId: zod_1.z.number().int().positive("Invalid answer ID")
});
// Enhanced pagination schema with stricter validation
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .max(500, "Page cannot exceed 500 for performance reasons")
        .default(1)
        .refine(val => val > 0, "Page must be a positive number"),
    limit: zod_1.z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50 for performance reasons")
        .default(10)
        .refine(val => val > 0, "Limit must be a positive number")
}).passthrough(); // Allow additional properties for filtering
// Admin-specific pagination with higher limits for administrative tasks
exports.adminPaginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .max(1000, "Page cannot exceed 1000")
        .default(1)
        .refine(val => val > 0, "Page must be a positive number"),
    limit: zod_1.z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(100, "Limit cannot exceed 100 for performance reasons")
        .default(10)
        .refine(val => val > 0, "Limit must be a positive number")
}).passthrough(); // Allow additional properties for filtering
// Specialized pagination validation middleware with enhanced error messages
function validatePagination(useAdminLimits = false) {
    return (req, res, next) => {
        try {
            const schema = useAdminLimits ? exports.adminPaginationSchema : exports.paginationSchema;
            const validation = schema.safeParse(req.query);
            if (!validation.success) {
                const errors = validation.error.issues.map(issue => {
                    const field = issue.path.join('.') || 'pagination';
                    let message = issue.message;
                    // Provide more specific error messages for common pagination issues
                    if (field === 'page') {
                        if (issue.code === 'too_small') {
                            const received = issue.received;
                            message = `Page number must be at least 1. Received: ${received}`;
                        }
                        else if (issue.code === 'too_big') {
                            const maxPage = useAdminLimits ? 1000 : 500;
                            const received = issue.received;
                            message = `Page number cannot exceed ${maxPage} for performance reasons. Received: ${received}`;
                        }
                        else if (issue.code === 'invalid_type') {
                            const received = issue.received;
                            message = `Page must be a valid number. Received: ${typeof received} (${received})`;
                        }
                    }
                    else if (field === 'limit') {
                        if (issue.code === 'too_small') {
                            const received = issue.received;
                            message = `Limit must be at least 1. Received: ${received}`;
                        }
                        else if (issue.code === 'too_big') {
                            const maxLimit = useAdminLimits ? 100 : 50;
                            const received = issue.received;
                            message = `Limit cannot exceed ${maxLimit} for performance reasons. Received: ${received}`;
                        }
                        else if (issue.code === 'invalid_type') {
                            const received = issue.received;
                            message = `Limit must be a valid number. Received: ${typeof received} (${received})`;
                        }
                    }
                    return {
                        field,
                        message,
                        code: issue.code,
                        received: issue.received
                    };
                });
                const errorMessage = `Pagination validation failed: ${errors.map(e => e.message).join(', ')}`;
                const maxPage = useAdminLimits ? 1000 : 500;
                const maxLimit = useAdminLimits ? 100 : 50;
                throw new AppError_1.BadRequestError(errorMessage, {
                    errors,
                    hint: `Valid pagination parameters: page (1-${maxPage}), limit (1-${maxLimit})`,
                    examples: {
                        valid: "?page=1&limit=10",
                        invalid: ["?page=0&limit=10", "?page=1&limit=1000", "?page=abc&limit=xyz"]
                    }
                });
            }
            // Replace request query with validated data
            req.query = Object.assign(Object.assign({}, req.query), validation.data);
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
// Enhanced generic validation middleware factory with better error messages
function validateRequest(schema) {
    return (req, res, next) => {
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
                throw new AppError_1.BadRequestError(errorMessage, {
                    errors,
                    hint: "Please ensure all required fields are provided with correct data types and formats"
                });
            }
            // Replace request body with validated data
            req.body = validation.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
// Enhanced query parameter validation middleware with better error messages
function validateQuery(schema) {
    return (req, res, next) => {
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
                throw new AppError_1.BadRequestError(`Query parameter validation failed: ${errorDetails}`, {
                    errors,
                    hint: "Please check the API documentation for valid parameter formats and ranges"
                });
            }
            // Replace request query with validated data
            req.query = validation.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
// Parameter validation middleware
function validateParams(paramSchema) {
    return (req, res, next) => {
        try {
            const validatedParams = {};
            for (const [key, schema] of Object.entries(paramSchema)) {
                const validation = schema.safeParse(req.params[key]);
                if (!validation.success) {
                    throw new AppError_1.BadRequestError(`Invalid ${key}: ${validation.error.issues[0].message}`);
                }
                validatedParams[key] = validation.data;
            }
            req.params = Object.assign(Object.assign({}, req.params), validatedParams);
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
// Sanitization utilities
function sanitizeString(str) {
    if (typeof str !== 'string')
        return '';
    return str
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .slice(0, 1000); // Limit length
}
function sanitizeMarkdown(str) {
    if (typeof str !== 'string')
        return '';
    return str
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .slice(0, 20000); // Higher limit for markdown content
}
function sanitizeId(id) {
    const parsed = parseInt(id, 10);
    return (!isNaN(parsed) && parsed > 0) ? parsed : null;
}
// Rate limiting specific validation
exports.rateLimitSchema = zod_1.z.object({
    windowMs: zod_1.z.number().min(1000).max(3600000), // 1 second to 1 hour
    maxRequests: zod_1.z.number().min(1).max(1000),
    skipSuccessfulRequests: zod_1.z.boolean().optional().default(false)
});
// Custom error formatter for better API responses
function formatValidationError(error) {
    return {
        message: "Validation failed",
        errors: error.issues.map(issue => (Object.assign({ field: issue.path.join('.') || 'root', message: issue.message }, (issue.code === 'invalid_type' && { received: issue.received }))))
    };
}
// ===============================================
// STUDENT SESSION FILTERING VALIDATION SCHEMAS
// ===============================================
// Schema for session results filtering query parameters
exports.sessionResultsQuerySchema = zod_1.z.object({
    // Answer type filter
    answerType: zod_1.z.enum(['correct', 'incorrect', 'all'], {
        errorMap: () => ({ message: "Answer type must be 'correct', 'incorrect', or 'all'" })
    }).optional().default('all'),
    // Session type filter
    sessionType: zod_1.z.nativeEnum(client_1.SessionType, {
        errorMap: () => ({ message: "Session type must be 'PRACTICE' or 'EXAM'" })
    }).optional(),
    // Multiple session IDs - support both comma-separated and array formats
    sessionIds: zod_1.z.union([
        zod_1.z.string().transform(str => str.split(',').map(id => parseInt(id.trim(), 10))),
        zod_1.z.array(zod_1.z.string()).transform(arr => arr.map(id => parseInt(id, 10))),
        zod_1.z.array(zod_1.z.number().int().positive())
    ]).optional().refine((ids) => !ids || ids.every(id => !isNaN(id) && id > 0), "All session IDs must be positive integers").refine((ids) => !ids || ids.length <= 50, "Cannot filter by more than 50 sessions at once"),
    // Specific exam/quiz filters
    examId: zod_1.z.coerce.number()
        .int("Exam ID must be an integer")
        .positive("Exam ID must be positive")
        .optional(),
    quizId: zod_1.z.coerce.number()
        .int("Quiz ID must be an integer")
        .positive("Quiz ID must be positive")
        .optional(),
    // Date range filters
    completedAfter: zod_1.z.string()
        .datetime("Completed after date must be in ISO format")
        .transform(str => new Date(str))
        .optional(),
    completedBefore: zod_1.z.string()
        .datetime("Completed before date must be in ISO format")
        .transform(str => new Date(str))
        .optional(),
    // Pagination
    page: zod_1.z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .max(1000, "Page cannot exceed 1000")
        .default(1),
    limit: zod_1.z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(100, "Limit cannot exceed 100")
        .default(20)
}).refine((data) => !data.examId || !data.quizId, "Cannot filter by both exam ID and quiz ID simultaneously").refine((data) => !data.completedAfter || !data.completedBefore || data.completedAfter <= data.completedBefore, "Completed after date must be before completed before date");
// Schema for available sessions query parameters
exports.availableSessionsQuerySchema = zod_1.z.object({
    sessionType: zod_1.z.nativeEnum(client_1.SessionType, {
        errorMap: () => ({ message: "Session type must be 'PRACTICE' or 'EXAM'" })
    }).optional()
});
// Schema for session status update
exports.updateSessionStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.SessionStatus, {
        errorMap: () => ({ message: "Status must be 'NOT_STARTED', 'IN_PROGRESS', or 'COMPLETED'" })
    })
});
// Schema for quiz history query parameters (enhanced version)
exports.quizHistoryQuerySchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.SessionType, {
        errorMap: () => ({ message: "Type must be 'PRACTICE' or 'EXAM'" })
    }).optional(),
    page: zod_1.z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .max(1000, "Page cannot exceed 1000")
        .default(1),
    limit: zod_1.z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50")
        .default(10)
});
// Schema for note creation with optional quiz/question association
exports.createNoteSchema = zod_1.z.object({
    noteText: zod_1.z.string()
        .trim()
        .min(1, "Note text cannot be empty")
        .max(2000, "Note text cannot exceed 2000 characters"),
    questionId: zod_1.z.coerce.number()
        .int("Question ID must be an integer")
        .positive("Question ID must be positive")
        .optional(),
    quizId: zod_1.z.coerce.number()
        .int("Quiz ID must be an integer")
        .positive("Quiz ID must be positive")
        .optional()
});
// Schema for note updates
exports.updateNoteSchema = zod_1.z.object({
    noteText: zod_1.z.string()
        .trim()
        .min(1, "Note text cannot be empty")
        .max(2000, "Note text cannot exceed 2000 characters")
});
// Schema for label creation
exports.createLabelSchema = zod_1.z.object({
    name: zod_1.z.string()
        .trim()
        .min(1, "Label name cannot be empty")
        .max(50, "Label name cannot exceed 50 characters")
        .regex(/^[a-zA-Z0-9\s\-_]+$/, "Label name contains invalid characters")
});
// Schema for todo creation
exports.createTodoSchema = zod_1.z.object({
    title: zod_1.z.string()
        .trim()
        .min(1, "Todo title cannot be empty")
        .max(100, "Todo title cannot exceed 100 characters"),
    description: zod_1.z.string()
        .trim()
        .max(500, "Description cannot exceed 500 characters")
        .optional(),
    type: zod_1.z.enum(['STUDY', 'REVIEW', 'PRACTICE', 'OTHER'], {
        errorMap: () => ({ message: "Type must be one of: STUDY, REVIEW, PRACTICE, OTHER" })
    }).optional(),
    priority: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
        errorMap: () => ({ message: "Priority must be one of: LOW, MEDIUM, HIGH, URGENT" })
    }).optional(),
    dueDate: zod_1.z.string()
        .datetime("Due date must be in ISO format")
        .transform(str => new Date(str))
        .optional(),
    courseId: zod_1.z.coerce.number()
        .int("Course ID must be an integer")
        .positive("Course ID must be positive")
        .optional(),
    quizId: zod_1.z.coerce.number()
        .int("Quiz ID must be an integer")
        .positive("Quiz ID must be positive")
        .optional()
});
// Schema for question report creation (canonical spec)
exports.createQuestionReportSchema = zod_1.z.object({
    reportType: zod_1.z.enum(['INCORRECT_ANSWER', 'TYPO', 'UNCLEAR_QUESTION', 'MISSING_INFO', 'OTHER'], {
        errorMap: () => ({ message: "Report type must be one of: INCORRECT_ANSWER, TYPO, UNCLEAR_QUESTION, MISSING_INFO, OTHER" })
    }),
    description: zod_1.z.string()
        .trim()
        .max(1000, "Description cannot exceed 1000 characters")
        .optional()
});
// Course analytics query schema
exports.courseAnalyticsQuerySchema = zod_1.z.object({
    sessionId: zod_1.z.coerce.number()
        .int("Session ID must be an integer")
        .positive("Session ID must be positive")
        .optional(),
    sessionType: zod_1.z.nativeEnum(client_1.SessionType, {
        errorMap: () => ({ message: "Session type must be 'PRACTICE', 'EXAM', or 'MOCK'" })
    }).optional(),
    page: zod_1.z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .max(1000, "Page cannot exceed 1000")
        .default(1),
    limit: zod_1.z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50")
        .default(20)
});
// Student questions query schema
exports.studentQuestionsQuerySchema = zod_1.z.object({
    // Filtering options
    universityIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    yearLevels: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(level => level.trim()).filter(level => ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'].includes(level)) : undefined),
    courseIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    moduleIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    uniteIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    examYears: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(year => parseInt(year.trim())).filter(year => !isNaN(year) && year >= 2000 && year <= 2100) : undefined),
    questionTypes: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(type => type.trim()).filter(type => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC'].includes(type)) : undefined),
    examIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    quizSourceIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    questionSourceIds: zod_1.z.string().optional().transform((val) => val ? val.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : undefined),
    // Question count and pagination
    count: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
    // Include metadata options
    includeAnswers: zod_1.z.coerce.boolean().optional().default(false),
    includeExplanations: zod_1.z.coerce.boolean().optional().default(false),
    includeImages: zod_1.z.coerce.boolean().optional().default(false),
    // Randomization
    randomize: zod_1.z.coerce.boolean().optional().default(true)
});
// ===============================================
// VALIDATION MIDDLEWARE HELPERS
// ===============================================
/**
 * Enhanced query validation that handles complex transformations
 */
function validateComplexQuery(schema) {
    return (req, res, next) => {
        try {
            // Handle array parameters that might come as strings
            const processedQuery = Object.assign({}, req.query);
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
            req.query = validation.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
/**
 * Sanitize and validate student notes to prevent XSS
 */
function sanitizeNoteText(noteText) {
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
exports.courseSchema = zod_1.z.object({
    name: zod_1.z.string()
        .trim()
        .min(3, "Course name must be at least 3 characters")
        .max(150, "Course name cannot exceed 150 characters"),
    description: zod_1.z.string()
        .trim()
        .max(2000, "Description cannot exceed 2000 characters")
        .optional(),
    moduleId: zod_1.z.number()
        .int("Module ID must be an integer")
        .positive("Module ID must be positive")
});
// Course resource schema
exports.resourceSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.ResourceType),
    title: zod_1.z.string()
        .trim()
        .min(3, "Resource title must be at least 3 characters")
        .max(200, "Resource title cannot exceed 200 characters"),
    description: zod_1.z.string()
        .trim()
        .max(1000, "Description cannot exceed 1000 characters")
        .optional(),
    courseId: zod_1.z.number()
        .int("Course ID must be an integer")
        .positive("Course ID must be positive"),
    filePath: zod_1.z.string().optional(),
    externalUrl: zod_1.z.string().url("Invalid external URL").optional(),
    youtubeVideoId: zod_1.z.string().regex(/^[a-zA-Z0-9_-]{11}$/, "Invalid YouTube video ID").optional(),
    isPaid: zod_1.z.boolean().default(false),
    price: zod_1.z.number().min(0).optional()
});
// Enhanced quiz creation schema for employees
exports.employeeQuizSchema = zod_1.z.object({
    title: zod_1.z.string()
        .trim()
        .min(5, "Quiz title must be at least 5 characters")
        .max(150, "Quiz title must not exceed 150 characters"),
    description: zod_1.z.string()
        .trim()
        .max(1000, "Description cannot exceed 1000 characters")
        .optional(),
    type: zod_1.z.nativeEnum(client_1.QuizType),
    courseId: zod_1.z.number()
        .int("Course ID must be an integer")
        .positive("Course ID must be positive")
        .optional(),
    universityId: zod_1.z.number()
        .int("University ID must be an integer")
        .positive("University ID must be positive")
        .optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    quizSourceId: zod_1.z.number()
        .int("Quiz Source ID must be an integer")
        .positive("Quiz Source ID must be positive")
        .optional(),
    quizYear: zod_1.z.number()
        .int("Quiz year must be an integer")
        .min(1900, "Quiz year must be 1900 or later")
        .max(new Date().getFullYear() + 10, "Quiz year cannot be more than 10 years in the future")
        .optional(),
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string()
            .trim()
            .min(10, "Question text must be at least 10 characters")
            .max(2000, "Question text cannot exceed 2000 characters"),
        explanation: zod_1.z.string()
            .trim()
            .max(1000, "Explanation cannot exceed 1000 characters")
            .optional(),
        questionType: zod_1.z.nativeEnum(quiz_types_1.QuestionType).optional().default(quiz_types_1.QuestionType.SINGLE_CHOICE),
        answers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string()
                .trim()
                .min(1, "Answer text cannot be empty")
                .max(500, "Answer text cannot exceed 500 characters"),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string()
                .trim()
                .max(500, "Answer explanation cannot exceed 500 characters")
                .optional(),
            images: zod_1.z.array(zod_1.z.object({
                imagePath: zod_1.z.string(),
                altText: zod_1.z.string().optional()
            })).optional()
        }))
            .min(2, "Must have at least 2 answers")
            .max(6, "Cannot have more than 6 answers")
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
    })).min(1, "Must have at least 1 question")
});
// Enhanced exam creation schema
exports.employeeExamSchema = zod_1.z.object({
    title: zod_1.z.string()
        .trim()
        .min(5, "Exam title must be at least 5 characters")
        .max(200, "Exam title must not exceed 200 characters"),
    description: zod_1.z.string()
        .trim()
        .max(2000, "Description cannot exceed 2000 characters")
        .optional(),
    moduleId: zod_1.z.number()
        .int("Module ID must be an integer")
        .positive("Module ID must be positive"),
    universityId: zod_1.z.number()
        .int("University ID must be an integer")
        .positive("University ID must be positive"),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel),
    examYear: zod_1.z.string()
        .min(4, "Exam year must be at least 4 characters")
        .max(30, "Exam year cannot exceed 30 characters"),
    year: zod_1.z.number()
        .int("Year must be an integer")
        .min(2000, "Year must be 2000 or later")
        .max(2100, "Year cannot exceed 2100"),
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string()
            .trim()
            .min(10, "Question text must be at least 10 characters")
            .max(2000, "Question text cannot exceed 2000 characters"),
        explanation: zod_1.z.string()
            .trim()
            .max(1000, "Explanation cannot exceed 1000 characters")
            .optional(),
        questionType: zod_1.z.nativeEnum(quiz_types_1.QuestionType).optional().default(quiz_types_1.QuestionType.SINGLE_CHOICE),
        answers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string()
                .trim()
                .min(1, "Answer text cannot be empty")
                .max(500, "Answer text cannot exceed 500 characters"),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string()
                .trim()
                .max(500, "Answer explanation cannot exceed 500 characters")
                .optional(),
            images: zod_1.z.array(zod_1.z.object({
                imagePath: zod_1.z.string(),
                altText: zod_1.z.string().optional()
            })).optional()
        }))
            .min(2, "Must have at least 2 answers")
            .max(6, "Cannot have more than 6 answers")
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
        message: "Must have exactly one correct answer",
        path: ["answers"]
    })).min(1, "Must have at least 1 question")
});
// Enhanced quiz session filters with source and year
exports.quizSessionFiltersSchema = zod_1.z.object({
    yearLevels: zod_1.z.array(zod_1.z.nativeEnum(client_1.YearLevel)).optional(),
    uniteIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    moduleIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    courseIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    quizSourceIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    quizYears: zod_1.z.array(zod_1.z.number().int().min(1900).max(new Date().getFullYear() + 10)).optional()
});
// Retake Session Validation Schema
exports.createRetakeSessionSchema = zod_1.z.object({
    originalSessionId: zod_1.z.number()
        .int("Original session ID must be an integer")
        .positive("Original session ID must be positive"),
    retakeType: zod_1.z.nativeEnum(client_1.RetakeType, {
        errorMap: () => ({ message: "Retake type must be SAME, INCORRECT_ONLY, CORRECT_ONLY, or NOT_RESPONDED" })
    }),
    title: zod_1.z.string()
        .trim()
        .min(3, "Title must be at least 3 characters")
        .max(100, "Title must not exceed 100 characters")
        .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, "Title contains invalid characters")
        .optional()
});
// Exam Question Ordering Schema
exports.updateExamQuestionOrderSchema = zod_1.z.object({
    examId: zod_1.z.number()
        .int("Exam ID must be an integer")
        .positive("Exam ID must be positive"),
    questionOrders: zod_1.z.array(zod_1.z.object({
        questionId: zod_1.z.number()
            .int("Question ID must be an integer")
            .positive("Question ID must be positive"),
        orderInExam: zod_1.z.number()
            .int("Order must be an integer")
            .min(1, "Order must be at least 1")
    })).min(1, "Must provide at least one question order")
});
