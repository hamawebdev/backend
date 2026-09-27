import { Router } from "express";
import { container } from "tsyringe";
import { z } from "zod";
import QuizController from "./quiz.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";
import {
  validateRequest,
  validateParams,
  validatePagination,
  submitAnswersSchema,
  updateAnswerSchema,
  createRetakeSessionSchema
} from "../../middleware/validation.middleware";

const router = Router();
const quizController = container.resolve(QuizController);

const idSchema = z.coerce.number().int().positive();
const sessionParamSchema = { sessionId: idSchema };
const questionParamSchema = { sessionId: idSchema, questionId: idSchema };

// All quiz session routes require authentication and active subscription
router.use(authMiddleware);
router.use(checkPayment());

// Quiz Session Management
router.get("/", validatePagination(false), (req, res) => quizController.getUserQuizSessions(req, res));
router.get("/type/:sessionType", (req, res) => quizController.getQuizSessionsByType(req, res));
router.get("/:sessionId/results", (req, res) => quizController.getSessionResults(req, res));
router.get("/:sessionId", (req, res) => quizController.getQuizSession(req, res));
router.post("/:sessionId/submit-answer",
  validateParams(sessionParamSchema),
  validateRequest(submitAnswersSchema),
  (req, res) => quizController.submitAnswers(req, res)
);
router.put("/:sessionId/questions/:questionId/answer",
  validateParams(questionParamSchema),
  validateRequest(updateAnswerSchema),
  (req, res) => quizController.updateQuizAnswer(req, res)
);

// Practice Session Creation by Label
router.post("/practice/:labelId", (req, res) => quizController.createPracticeSessionByLabel(req, res));

// Retake Session Management
router.post("/retake",
  validateRequest(createRetakeSessionSchema),
  (req, res) => quizController.createRetakeSession(req, res)
);

export default router;
