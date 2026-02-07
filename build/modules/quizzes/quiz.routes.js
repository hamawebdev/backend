"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const zod_1 = require("zod");
const quiz_controller_1 = __importDefault(require("./quiz.controller"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const paymentCheck_middleware_1 = require("../../core/middlewares/paymentCheck.middleware");
const validation_middleware_1 = require("../../middleware/validation.middleware");
const roleCheck_middleware_1 = require("../../core/middlewares/roleCheck.middleware");
const router = (0, express_1.Router)();
const quizController = tsyringe_1.container.resolve(quiz_controller_1.default);
// Parameter validation schemas
const idSchema = zod_1.z.coerce.number().int().positive();
const sessionParamSchema = { sessionId: idSchema };
const questionParamSchema = {
    sessionId: idSchema,
    questionId: idSchema
};
// Apply global middleware
router.use(auth_middleware_1.default);
router.use((0, paymentCheck_middleware_1.checkPayment)());
router.use(roleCheck_middleware_1.studentOnly);
// ==========================================
// CANONICAL SPEC ENDPOINTS
// ==========================================
// GET /quizzes/session-filters - Canonical: Quiz/session filters with question counts
router.get("/session-filters", (req, res) => quizController.getSessionFilters(req, res));
// POST /quizzes/question-count - Canonical: Get question count with filters
router.post("/question-count", (0, validation_middleware_1.validateRequest)(validation_middleware_1.canonicalQuestionCountSchema), (req, res) => quizController.getQuestionCountPost(req, res));
// GET /quizzes/questions-by-unite-or-module - Canonical: Questions by unite or module
router.get("/questions-by-unite-or-module", (req, res) => quizController.getQuestionsByUniteOrModule(req, res));
// POST /quizzes/sessions - Canonical: Create quiz session
router.post("/sessions", (0, validation_middleware_1.validateRequest)(validation_middleware_1.canonicalCreateSessionSchema), (req, res) => quizController.createQuizSessionCanonical(req, res));
// GET /quizzes/residency-sessions-only - Canonical: Get user's residency sessions
router.get("/residency-sessions-only", (req, res) => quizController.getResidencySessionsOnly(req, res));
// POST /quizzes/residency-sessions - Canonical: Create residency session
router.post("/residency-sessions", (req, res) => quizController.createResidencySession(req, res));
// ==========================================
// LEGACY ENDPOINTS (for backward compatibility)
// ==========================================
// Dynamic Quiz Generation (legacy)
router.post("/quiz-sessions", (0, validation_middleware_1.validateQuizSessionRequest)(), (req, res) => quizController.createQuizSession(req, res));
// Quiz Filters (legacy)
router.get("/quiz-filters", (req, res) => quizController.getQuizFilters(req, res));
// Residency Session Filters
router.get("/session-residency-filters", (req, res) => quizController.getResidencySessionFilters(req, res));
// Exam Session Filters
router.get("/exam-session-filters", (req, res) => quizController.getExamSessionFilters(req, res));
// Create Session by Questions
router.post("/create-session-by-questions", (0, validation_middleware_1.validateRequest)(validation_middleware_1.createSessionByQuestionsSchema), (req, res) => quizController.createSessionByQuestions(req, res));
// Question Count (legacy GET)
router.get("/question-count", (0, validation_middleware_1.validateQuery)(validation_middleware_1.questionCountQuerySchema), (req, res) => quizController.getQuestionCount(req, res));
exports.default = router;
