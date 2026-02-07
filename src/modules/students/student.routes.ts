import { Router } from "express";
import { container } from "tsyringe";
import { z } from "zod";
import StudentController from "./student.controller";
import QuizController from "../quizzes/quiz.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";
import { studentOnly } from "../../core/middlewares/roleCheck.middleware";
import { codeValidationRateLimit, codeRedemptionRateLimit } from "../../middleware/rate-limit.middleware";
import { validateActivationCodeSchema } from "../admin/validations/admin.validation";
import {
  validateRequest,
  validateQuery,
  validateParams,
  validateComplexQuery,
  validatePagination,
  submitAnswersSchema,
  updateAnswerSchema,
  sessionResultsQuerySchema,
  availableSessionsQuerySchema,
  quizHistoryQuerySchema,
  createNoteSchema,
  updateNoteSchema,
  createLabelSchema,
  createTodoSchema,
  createQuestionReportSchema,
  updateSessionStatusSchema,
  studentQuestionsQuerySchema,
  courseAnalyticsQuerySchema
} from "../../middleware/validation.middleware";

const router = Router();
const studentController = container.resolve(StudentController);
const quizController = container.resolve(QuizController);

// Parameter validation schemas
const idSchema = z.coerce.number().int().positive();
const sessionParamSchema = { sessionId: idSchema };
const questionParamSchema = {
  sessionId: idSchema,
  questionId: idSchema
};

// Apply middleware to all routes
router.use(authMiddleware);
router.use(studentOnly);

// ==========================================
// CONTENT NAVIGATION (Canonical spec endpoints)
// ==========================================

// GET /students/content/filters - Hierarchical content structure
router.get("/content/filters",
  checkPayment(),
  (req, res) => studentController.getContentFilters(req, res)
);

// GET /students/courses/by-module - Courses by moduleId or uniteId
router.get("/courses/by-module",
  checkPayment(),
  (req, res) => studentController.getCoursesByModule(req, res)
);

// GET /students/modules/:moduleId/books - Books for a module
router.get("/modules/:moduleId/books",
  checkPayment(),
  (req, res) => studentController.getModuleBooks(req, res)
);

// ==========================================
// PRACTICE SESSIONS (Canonical spec endpoints)
// ==========================================

// GET /students/sessions/filters - Session filters by type
router.get("/sessions/filters",
  checkPayment(),
  (req, res) => studentController.getSessionsFilters(req, res)
);

// GET /students/sessions/residency-filters - Canonical: Residency filters
router.get("/sessions/residency-filters",
  checkPayment(),
  (req, res) => studentController.getResidencyFilters(req, res)
);

// GET /students/practise-sessions - Practice sessions listing
router.get("/practise-sessions",
  checkPayment(),
  (req, res) => studentController.getPractiseSessions(req, res)
);

// ==========================================
// STUDENT PROGRESS & ANALYTICS
// ==========================================

router.get("/progress/overview",
  checkPayment(),
  (req, res) => studentController.getProgressOverview(req, res)
);

router.put("/courses/:courseId/progress",
  validateParams({ courseId: idSchema }),
  checkPayment(),
  (req, res) => studentController.updateCourseProgress(req, res)
);

router.get("/quiz-history",
  validateQuery(quizHistoryQuerySchema),
  checkPayment(),
  (req, res) => studentController.getQuizHistory(req, res)
);

router.get("/course-analytics",
  validateQuery(courseAnalyticsQuerySchema),
  checkPayment(),
  (req, res) => studentController.getCourseAnalytics(req, res)
);

// New enhanced filtering endpoints
router.get("/session-results",
  checkPayment(),
  (req, res) => studentController.getStudentSessionResults(req, res)
);

router.get("/available-sessions",
  validateQuery(availableSessionsQuerySchema),
  checkPayment(),
  (req, res) => studentController.getAvailableSessionsForFiltering(req, res)
);

// Quiz Session Management (moved from quiz routes for better organization)
router.get("/quiz-sessions",
  validatePagination(false), // Use standard pagination limits for students
  (req, res) => quizController.getUserQuizSessions(req, res)
);

router.get("/quiz-sessions/:sessionId",
  validateParams(sessionParamSchema),
  (req, res) => quizController.getQuizSession(req, res)
);

router.post("/quiz-sessions/:sessionId/submit-answer",
  validateParams(sessionParamSchema),
  validateRequest(submitAnswersSchema),
  (req, res) => quizController.submitAnswers(req, res)
);

router.put("/quiz-sessions/:sessionId/questions/:questionId/answer",
  validateParams(questionParamSchema),
  validateRequest(updateAnswerSchema),
  (req, res) => quizController.updateQuizAnswer(req, res)
);

// Delete a quiz session (student-only)
router.delete("/quiz-sessions/:sessionId",
  validateParams(sessionParamSchema),
  (req, res) => quizController.deleteQuizSession(req, res)
);

// Update session status (students can update their own, admin/employee can update any)
router.patch("/quiz-sessions/:sessionId/status",
  validateParams(sessionParamSchema),
  validateRequest(updateSessionStatusSchema),
  (req, res) => quizController.updateSessionStatus(req, res)
);


// ==========================================
// SUBSCRIPTION-BASED QUESTION RETRIEVAL
// ==========================================

router.get("/questions",
  checkPayment(),
  validateQuery(studentQuestionsQuerySchema as any),
  (req, res) => studentController.getQuestionsBasedOnSubscription(req, res)
);

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

router.get("/subscriptions",
  (req, res) => studentController.getUserSubscriptions(req, res)
);

// ==========================================
// STUDENT NOTES SYSTEM (Canonical API)
// ==========================================

// GET /students/notes - Canonical: returns flat array with labels
router.get("/notes",
  (req, res) => studentController.getStudentNotes(req, res)
);

// GET /students/notes/by-module - Canonical: returns grouped notes
// Note: Must be before /:noteId to avoid route conflict
router.get("/notes/by-module",
  (req, res) => studentController.getNotesByModule(req, res)
);

// POST /students/notes - Canonical: returns note object with 201 status
router.post("/notes",
  (req, res) => studentController.createStudentNote(req, res)
);

// PUT /students/notes/:noteId - Canonical: returns note object with labels
router.put("/notes/:noteId",
  validateParams({ noteId: idSchema }),
  (req, res) => studentController.updateStudentNote(req, res)
);

// DELETE /students/notes/:noteId - Canonical: returns { message }
router.delete("/notes/:noteId",
  validateParams({ noteId: idSchema }),
  (req, res) => studentController.deleteStudentNote(req, res)
);

// GET /students/questions/:questionId/notes - Canonical: returns array with labels
router.get("/questions/:questionId/notes",
  validateParams({ questionId: idSchema }),
  (req, res) => studentController.getQuestionNotes(req, res)
);

// ==========================================
// LABELING SYSTEM (Canonical API)
// ==========================================

// GET /students/labels - Canonical: returns { data: [...] }
router.get("/labels",
  (req, res) => studentController.getStudentLabels(req, res)
);

// GET /students/labels/by-module - Canonical: returns { labels: [...] }
// Note: Must be before /:labelId to avoid route conflict
router.get("/labels/by-module",
  (req, res) => studentController.getLabelsByModule(req, res)
);

// GET /students/labels/:labelId - Canonical: returns object directly
router.get("/labels/:labelId",
  validateParams({ labelId: idSchema }),
  (req, res) => studentController.getStudentLabelById(req, res)
);

// POST /students/labels - Canonical: returns object with 201 status
router.post("/labels",
  (req, res) => studentController.createStudentLabel(req, res)
);

// PUT /students/labels/:labelId - Canonical: returns object with statistics
router.put("/labels/:labelId",
  validateParams({ labelId: idSchema }),
  (req, res) => studentController.updateStudentLabel(req, res)
);

// DELETE /students/labels/:labelId - Canonical: returns { message }
router.delete("/labels/:labelId",
  validateParams({ labelId: idSchema }),
  (req, res) => studentController.deleteStudentLabel(req, res)
);

router.post("/quizzes/:quizId/labels/:labelId",
  validateParams({ quizId: idSchema, labelId: idSchema }),
  (req, res) => studentController.addQuizToLabel(req, res)
);

// POST /students/questions/:questionId/labels/:labelId - Canonical: returns { message }
router.post("/questions/:questionId/labels/:labelId",
  validateParams({ questionId: idSchema, labelId: idSchema }),
  (req, res) => studentController.addQuestionToLabel(req, res)
);

// DELETE /students/questions/:questionId/labels/:labelId - Canonical: returns { message }
router.delete("/questions/:questionId/labels/:labelId",
  validateParams({ questionId: idSchema, labelId: idSchema }),
  (req, res) => studentController.removeQuestionFromLabel(req, res)
);

// ==========================================
// TODO & TASK MANAGEMENT
// ==========================================

router.get("/todos",
  validatePagination(false), // Use standard pagination limits for students
  (req, res) => studentController.getTodos(req, res)
);

router.post("/todos",
  (req, res) => studentController.createTodo(req, res)
);

router.put("/todos/:id",
  validateParams({ id: idSchema }),
  (req, res) => studentController.updateTodo(req, res)
);

router.delete("/todos/:id",
  validateParams({ id: idSchema }),
  (req, res) => studentController.deleteTodo(req, res)
);

router.put("/todos/:id/complete",
  validateParams({ id: idSchema }),
  (req, res) => studentController.completeTodo(req, res)
);

// ==========================================
// QUESTION REPORTING SYSTEM
// ==========================================

router.post("/questions/:questionId/report",
  validateParams({ questionId: idSchema }),
  (req, res) => studentController.createQuestionReport(req, res)
);

router.get("/reports",
  (req, res) => studentController.getUserReports(req, res)
);

router.get("/reports/:reportId",
  validateParams({ reportId: idSchema }),
  (req, res) => studentController.getReportById(req, res)
);

// ==========================================
// ENHANCED DASHBOARD FEATURES
// ==========================================

router.get("/dashboard/performance",
  (req, res) => studentController.getDetailedPerformanceAnalytics(req, res)
);

// GET /students/dashboard/stats - Canonical: dashboard statistics
router.get("/dashboard/stats",
  (req, res) => studentController.getDashboardStats(req, res)
);

// GET /students/analytics/time-based - Canonical: time-based analytics
router.get("/analytics/time-based",
  checkPayment(),
  (req, res) => studentController.getTimeBasedAnalytics(req, res)
);

// GET /students/courses/:courseId/progress - Canonical: course progress
router.get("/courses/:courseId/progress",
  validateParams({ courseId: idSchema }),
  checkPayment(),
  (req, res) => studentController.getCourseProgress(req, res)
);

router.get("/session-stats",
  checkPayment(),
  (req, res) => studentController.getSessionStatistics(req, res)
);

// ==========================================
// ACTIVATION CODE VALIDATION & REDEMPTION
// ==========================================

// Validate activation code (with rate limiting)
router.post("/codes/validate",
  codeValidationRateLimit,
  validateRequest(validateActivationCodeSchema),
  (req, res) => studentController.validateActivationCode(req, res)
);

// Redeem activation code (with stricter rate limiting)
router.post("/codes/redeem",
  codeRedemptionRateLimit,
  validateRequest(validateActivationCodeSchema),
  (req, res) => studentController.redeemActivationCode(req, res)
);

// ==========================================
// COURSE LAYERS & CARDS (Canonical API)
// ==========================================

// POST /students/course-layers - Upsert course layer
router.post("/course-layers",
  checkPayment(),
  (req, res) => studentController.upsertCourseLayer(req, res)
);

// GET /students/courses/:courseId/layers - Get course layers
router.get("/courses/:courseId/layers",
  validateParams({ courseId: idSchema }),
  checkPayment(),
  (req, res) => studentController.getCourseLayersCanonical(req, res)
);

// POST /students/cards - Create card
router.post("/cards",
  checkPayment(),
  (req, res) => studentController.createCard(req, res)
);

// GET /students/cards - Get all cards
router.get("/cards",
  checkPayment(),
  (req, res) => studentController.getAllCards(req, res)
);

// GET /students/cards/filter-by-unit-module - Filter cards by unit/module
// Note: Must be before /:cardId to avoid route conflict
router.get("/cards/filter-by-unit-module",
  checkPayment(),
  (req, res) => studentController.getCardsByUnitModule(req, res)
);

// GET /students/cards/:cardId - Get card by ID
router.get("/cards/:cardId",
  validateParams({ cardId: idSchema }),
  checkPayment(),
  (req, res) => studentController.getCardById(req, res)
);

// PUT /students/cards/:cardId - Update card
router.put("/cards/:cardId",
  validateParams({ cardId: idSchema }),
  checkPayment(),
  (req, res) => studentController.updateCard(req, res)
);

// DELETE /students/cards/:cardId - Delete card
router.delete("/cards/:cardId",
  validateParams({ cardId: idSchema }),
  checkPayment(),
  (req, res) => studentController.deleteCard(req, res)
);

// POST /students/cards/:cardId/courses/:courseId - Add course to card
router.post("/cards/:cardId/courses/:courseId",
  validateParams({ cardId: idSchema, courseId: idSchema }),
  checkPayment(),
  (req, res) => studentController.addCourseToCard(req, res)
);

// DELETE /students/cards/:cardId/courses/:courseId - Remove course from card
router.delete("/cards/:cardId/courses/:courseId",
  validateParams({ cardId: idSchema, courseId: idSchema }),
  checkPayment(),
  (req, res) => studentController.removeCourseFromCard(req, res)
);

// GET /students/cards/:cardId/progress - Get card progress
router.get("/cards/:cardId/progress",
  validateParams({ cardId: idSchema }),
  checkPayment(),
  (req, res) => studentController.getCardProgress(req, res)
);

export default router;