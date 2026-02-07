"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const quiz_controller_1 = __importDefault(require("./quiz.controller"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const paymentCheck_middleware_1 = require("../../core/middlewares/paymentCheck.middleware");
const router = (0, express_1.Router)();
const quizController = tsyringe_1.container.resolve(quiz_controller_1.default);
// All quiz session routes require authentication and active subscription
router.use(auth_middleware_1.default);
router.use((0, paymentCheck_middleware_1.checkPayment)());
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
exports.default = router;
