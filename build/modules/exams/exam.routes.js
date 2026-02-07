"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const exam_controller_1 = __importDefault(require("./exam.controller"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const paymentCheck_middleware_1 = require("../../core/middlewares/paymentCheck.middleware");
// import { validateRequest, createExamSessionSchema } from "../../middleware/validation.middleware";
const router = (0, express_1.Router)();
const examController = tsyringe_1.container.resolve(exam_controller_1.default);
// All exam routes require authentication and active subscription
router.use(auth_middleware_1.default);
router.use((0, paymentCheck_middleware_1.checkPayment)());
// Exam Session Creation
router.post("/exam-sessions", 
// validateRequest(createExamSessionSchema),
(req, res) => examController.createExamSession(req, res));
// Create exam session from multiple modules
router.post("/exam-sessions/from-modules", (req, res) => examController.createExamSessionFromModules(req, res));
// Exam Selection & Practice
router.get("/available", (req, res) => examController.getAvailableExams(req, res));
router.get("/by-module/:moduleId/:year", (req, res) => examController.getExamsByModuleAndYear(req, res));
router.get("/:examId", (req, res) => examController.getExamDetails(req, res));
router.get("/:examId/questions", (req, res) => examController.getExamQuestions(req, res));
exports.default = router;
