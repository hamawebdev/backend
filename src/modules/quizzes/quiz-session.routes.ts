import { Router } from "express";
import { container } from "tsyringe";
import QuizController from "./quiz.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";

const router = Router();
const quizController = container.resolve(QuizController);

// All quiz session routes require authentication and active subscription
router.use(authMiddleware);
router.use(checkPayment());

// Quiz Session Management
router.get("/", (req, res) => quizController.getUserQuizSessions(req, res));
router.get("/type/:sessionType", (req, res) => quizController.getQuizSessionsByType(req, res));
router.get("/:sessionId/results", (req, res) => quizController.getSessionResults(req, res));
router.get("/:sessionId", (req, res) => quizController.getQuizSession(req, res));
router.post("/:sessionId/submit-answer", (req, res) => quizController.submitAnswers(req, res));
router.put("/:sessionId/questions/:questionId/answer", (req, res) => quizController.updateQuizAnswer(req, res));

// Practice Session Creation by Label
router.post("/practice/:labelId", (req, res) => quizController.createPracticeSessionByLabel(req, res));

// Retake Session Management
router.post("/retake", (req, res) => quizController.createRetakeSession(req, res));

export default router; 