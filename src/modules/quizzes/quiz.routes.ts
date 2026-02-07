import { Router } from "express";
import { container } from "tsyringe";
import { z } from "zod";
import QuizController from "./quiz.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";
import {
  validateRequest,
  validateQuery,
  validateParams,
  validateQuizSessionRequest,
  submitAnswersSchema,
  updateAnswerSchema,
  paginationSchema,
  createSessionByQuestionsSchema,
  questionCountQuerySchema,
  canonicalQuestionCountSchema,
  canonicalCreateSessionSchema
} from "../../middleware/validation.middleware";
import { studentOnly } from "../../core/middlewares/roleCheck.middleware";

const router = Router();
const quizController = container.resolve(QuizController);

// Parameter validation schemas
const idSchema = z.coerce.number().int().positive();
const sessionParamSchema = { sessionId: idSchema };
const questionParamSchema = {
  sessionId: idSchema,
  questionId: idSchema
};

// Apply global middleware

router.use(authMiddleware);
router.use(checkPayment());
router.use(studentOnly);


// ==========================================
// CANONICAL SPEC ENDPOINTS
// ==========================================

// GET /quizzes/session-filters - Canonical: Quiz/session filters with question counts
router.get("/session-filters",
  (req, res) => quizController.getSessionFilters(req, res)
);

// POST /quizzes/question-count - Canonical: Get question count with filters
router.post("/question-count",
  validateRequest(canonicalQuestionCountSchema),
  (req, res) => quizController.getQuestionCountPost(req, res)
);

// GET /quizzes/questions-by-unite-or-module - Canonical: Questions by unite or module
router.get("/questions-by-unite-or-module",
  (req, res) => quizController.getQuestionsByUniteOrModule(req, res)
);

// POST /quizzes/sessions - Canonical: Create quiz session
router.post("/sessions",
  validateRequest(canonicalCreateSessionSchema),
  (req, res) => quizController.createQuizSessionCanonical(req, res)
);

// GET /quizzes/residency-sessions-only - Canonical: Get user's residency sessions
router.get("/residency-sessions-only",
  (req, res) => quizController.getResidencySessionsOnly(req, res)
);

// POST /quizzes/residency-sessions - Canonical: Create residency session
router.post("/residency-sessions",
  (req, res) => quizController.createResidencySession(req, res)
);

// ==========================================
// LEGACY ENDPOINTS (for backward compatibility)
// ==========================================

// Dynamic Quiz Generation (legacy)
router.post("/quiz-sessions",
  validateQuizSessionRequest(),
  (req, res) => quizController.createQuizSession(req, res)
);

// Quiz Filters (legacy)
router.get("/quiz-filters",
  (req, res) => quizController.getQuizFilters(req, res)
);

// Residency Session Filters
router.get("/session-residency-filters",
  (req, res) => quizController.getResidencySessionFilters(req, res)
);

// Exam Session Filters
router.get("/exam-session-filters",
  (req, res) => quizController.getExamSessionFilters(req, res)
);

// Create Session by Questions
router.post("/create-session-by-questions",
  validateRequest(createSessionByQuestionsSchema),
  (req, res) => quizController.createSessionByQuestions(req, res)
);

// Question Count (legacy GET)
router.get("/question-count",
  validateQuery(questionCountQuerySchema),
  (req, res) => quizController.getQuestionCount(req, res)
);

export default router;