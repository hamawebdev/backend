"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const zod_1 = require("zod");
const question_controller_1 = __importDefault(require("./question.controller"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const roleCheck_middleware_1 = require("../../core/middlewares/roleCheck.middleware");
const validation_middleware_1 = require("../../middleware/validation.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const questionController = tsyringe_1.container.resolve(question_controller_1.default);
// Validation schemas
const imageSchema = zod_1.z.object({
    imagePath: zod_1.z.string().min(1, "Image path is required"),
    altText: zod_1.z.string().optional(),
});
const createQuestionSchema = zod_1.z.object({
    questionText: zod_1.z.string().min(5, "Question text must be at least 5 characters"),
    explanation: zod_1.z.string().optional(),
    questionType: zod_1.z.nativeEnum(client_1.QuestionType).optional(),
    courseId: zod_1.z.number().int().positive().optional(),
    examId: zod_1.z.number().int().positive().optional(),
    sourceId: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    examYear: zod_1.z.number().int().min(2000).max(2100).optional(),
    metadata: zod_1.z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(),
    questionImages: zod_1.z.array(imageSchema).max(10).optional(),
    explanationImages: zod_1.z.array(imageSchema).max(10).optional(),
    answers: zod_1.z.array(zod_1.z.object({
        answerText: zod_1.z.string().min(1, "Answer text is required"),
        isCorrect: zod_1.z.boolean(),
        explanation: zod_1.z.string().optional(),
        images: zod_1.z.array(zod_1.z.object({
            imagePath: zod_1.z.string(),
            altText: zod_1.z.string().optional(),
        })).optional(),
    })).min(2, "At least 2 answers are required"),
}).refine((data) => {
    const correctAnswersCount = data.answers.filter(a => a.isCorrect).length;
    // QROC questions don't need multiple answers
    if (data.questionType === client_1.QuestionType.QROC) {
        return true;
    }
    if (data.questionType === client_1.QuestionType.SINGLE_CHOICE) {
        return correctAnswersCount === 1;
    }
    if (data.questionType === client_1.QuestionType.MULTIPLE_CHOICE) {
        return correctAnswersCount >= 2;
    }
    // Default to single choice validation
    return correctAnswersCount === 1;
}, {
    message: "Invalid number of correct answers for the question type",
});
const updateQuestionSchema = zod_1.z.object({
    questionText: zod_1.z.string().min(5).optional(),
    explanation: zod_1.z.string().optional(),
    questionType: zod_1.z.nativeEnum(client_1.QuestionType).optional(),
    courseId: zod_1.z.number().int().positive().optional(),
    examId: zod_1.z.number().int().positive().optional(),
    sourceId: zod_1.z.number().int().positive().optional(),
    universityId: zod_1.z.number().int().positive().optional(),
    yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
    metadata: zod_1.z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(),
    answers: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.number().int().positive().optional(),
        answerText: zod_1.z.string().min(1).optional(),
        isCorrect: zod_1.z.boolean().optional(),
        explanation: zod_1.z.string().optional()
    })).optional()
});
const updateQuestionExplanationSchema = zod_1.z.object({
    explanation: zod_1.z.string().min(1, "Explanation is required").max(5000, "Explanation must be 5000 characters or less"),
    explanationImages: zod_1.z.array(zod_1.z.object({
        imagePath: zod_1.z.string()
            .min(1, "Image path is required")
            .max(255, "Image path must be 255 characters or less")
            .refine((path) => {
            const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'];
            const extension = path.toLowerCase().substring(path.lastIndexOf('.'));
            return allowedExtensions.includes(extension);
        }, {
            message: "Invalid image format. Allowed formats: .jpg, .jpeg, .png, .gif, .bmp, .tiff, .webp, .svg"
        }),
        altText: zod_1.z.string()
            .max(255, "Alt text must be 255 characters or less")
            .optional(),
    }))
        .max(10, "Maximum 10 explanation images allowed")
        .optional(),
});
const updateQuestionImageSchema = zod_1.z.object({
    imagePath: zod_1.z.string().min(1, "Image path is required"),
    altText: zod_1.z.string().optional(),
});
const addQuestionExplanationImagesSchema = zod_1.z.object({
    images: zod_1.z.array(zod_1.z.object({
        imagePath: zod_1.z.string().min(1, "Image path is required"),
        altText: zod_1.z.string().optional(),
    })).min(1, "At least one image is required"),
});
const updateQuestionExplanationImageSchema = zod_1.z.object({
    imagePath: zod_1.z.string().min(1, "Image path is required"),
    altText: zod_1.z.string().optional(),
});
const bulkCreateQuestionsSchema = zod_1.z.object({
    metadata: zod_1.z.object({
        courseId: zod_1.z.number().int().positive().optional(),
        examId: zod_1.z.number().int().positive().optional(),
        sourceId: zod_1.z.number().int().positive().optional(),
        universityId: zod_1.z.number().int().positive().optional(),
        yearLevel: zod_1.z.nativeEnum(client_1.YearLevel).optional(),
        examYear: zod_1.z.number().int().min(2000).max(2100).optional(),
    }),
    questions: zod_1.z.array(zod_1.z.object({
        questionText: zod_1.z.string().min(5, "Question text must be at least 5 characters"),
        explanation: zod_1.z.string().optional(),
        questionType: zod_1.z.nativeEnum(client_1.QuestionType).optional(),
        questionImages: zod_1.z.array(imageSchema).max(10).optional(),
        explanationImages: zod_1.z.array(imageSchema).max(10).optional(),
        answers: zod_1.z.array(zod_1.z.object({
            answerText: zod_1.z.string().min(1, "Answer text is required"),
            isCorrect: zod_1.z.boolean(),
            explanation: zod_1.z.string().optional(),
            images: zod_1.z.array(zod_1.z.object({
                imagePath: zod_1.z.string(),
                altText: zod_1.z.string().optional(),
            })).optional(),
        })).min(0), // Allow 0 answers for QROC questions
    })).min(1, "At least one question is required"),
}).refine((data) => {
    // Validate each question's answers
    for (const question of data.questions) {
        const correctAnswersCount = question.answers.filter(a => a.isCorrect).length;
        // QROC questions don't need answer validation
        if (question.questionType === client_1.QuestionType.QROC) {
            continue;
        }
        if (question.questionType === client_1.QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
            return false;
        }
        if (question.questionType === client_1.QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
            return false;
        }
        // Default to single choice validation (requires answers)
        if (!question.questionType && (question.answers.length < 2 || correctAnswersCount !== 1)) {
            return false;
        }
    }
    return true;
}, {
    message: "One or more questions have invalid number of correct answers for their type",
});
// Apply global middleware
router.use(auth_middleware_1.default);
router.use(roleCheck_middleware_1.adminOrEmployee);
// Question management routes
router.post("/", (0, validation_middleware_1.validateRequest)(createQuestionSchema), (req, res, next) => questionController.createQuestion(req, res, next));
router.post("/bulk", (0, validation_middleware_1.validateRequest)(bulkCreateQuestionsSchema), (req, res, next) => questionController.createQuestionsInBulk(req, res, next));
// NEW: Update a question
router.put("/:id", (0, validation_middleware_1.validateRequest)(updateQuestionSchema), (req, res, next) => questionController.updateQuestion(req, res, next));
router.put("/:id/explanation", (0, validation_middleware_1.validateRequest)(updateQuestionExplanationSchema), (req, res, next) => questionController.updateQuestionExplanation(req, res, next));
router.get("/filters", (req, res, next) => questionController.getQuestionFilters(req, res, next));
// Get single question
router.get("/:id", (req, res, next) => questionController.getQuestionById(req, res, next));
// Attach images to a question
router.post("/:id/images", (req, res, next) => questionController.addQuestionImages(req, res, next));
// Update a specific image from a question
router.put("/:id/images/:imageId", (0, validation_middleware_1.validateRequest)(updateQuestionImageSchema), (req, res, next) => questionController.updateQuestionImage(req, res, next));
// Delete a specific image from a question
router.delete("/:id/images/:imageId", (req, res, next) => questionController.deleteQuestionImage(req, res, next));
// NEW: Delete a question
router.delete("/:id", (req, res, next) => questionController.deleteQuestion(req, res, next));
// Explanation Images Management Routes
// Attach explanation images to a question
router.post("/:id/explanation-images", (0, validation_middleware_1.validateRequest)(addQuestionExplanationImagesSchema), (req, res, next) => questionController.addQuestionExplanationImages(req, res, next));
// Update a specific explanation image from a question
router.put("/:id/explanation-images/:imageId", (0, validation_middleware_1.validateRequest)(updateQuestionExplanationImageSchema), (req, res, next) => questionController.updateQuestionExplanationImage(req, res, next));
// Delete a specific explanation image from a question
router.delete("/:id/explanation-images/:imageId", (req, res, next) => questionController.deleteQuestionExplanationImage(req, res, next));
exports.default = router;
