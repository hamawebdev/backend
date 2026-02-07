import { Router } from "express";
import { container } from "tsyringe";
import ExamController from "./exam.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { checkPayment } from "../../core/middlewares/paymentCheck.middleware";
// import { validateRequest, createExamSessionSchema } from "../../middleware/validation.middleware";

const router = Router();
const examController = container.resolve(ExamController);

// All exam routes require authentication and active subscription
router.use(authMiddleware);
router.use(checkPayment());

// Exam Session Creation
router.post("/exam-sessions",
  // validateRequest(createExamSessionSchema),
  (req, res) => examController.createExamSession(req, res)
);

// Create exam session from multiple modules
router.post("/exam-sessions/from-modules",
  (req, res) => examController.createExamSessionFromModules(req, res)
);

// Exam Selection & Practice
router.get("/available", (req, res) => examController.getAvailableExams(req, res));
router.get("/by-module/:moduleId/:year", (req, res) => examController.getExamsByModuleAndYear(req, res));
router.get("/:examId", (req, res) => examController.getExamDetails(req, res));
router.get("/:examId/questions", (req, res) => examController.getExamQuestions(req, res));

export default router; 