"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const zod_1 = require("zod");
const admin_controller_1 = __importDefault(require("./admin.controller"));
const upload_routes_1 = __importDefault(require("./upload.routes"));
const question_routes_1 = __importDefault(require("../questions/question.routes"));
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const roleCheck_middleware_1 = require("../../core/middlewares/roleCheck.middleware");
const media_utils_1 = require("../../core/utils/media.utils");
const question_service_1 = __importDefault(require("../questions/question.service"));
const AppError_1 = require("../../core/errors/AppError");
const validation_middleware_1 = require("../../middleware/validation.middleware");
const admin_validation_1 = require("./validations/admin.validation");
const router = (0, express_1.Router)();
const adminController = tsyringe_1.container.resolve(admin_controller_1.default);
const mediaHandler = tsyringe_1.container.resolve("mediaHandler");
const questionService = tsyringe_1.container.resolve(question_service_1.default);
// Apply authentication to all routes
router.use(auth_middleware_1.default);
// ==========================================
// DASHBOARD & ANALYTICS (Admin Only)
// ==========================================
// Dashboard stats
router.get("/dashboard/stats", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getDashboardStats(req, res, next));
// User analytics
router.get("/analytics/users", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getUserAnalytics(req, res, next));
// ==========================================
// USER MANAGEMENT (Admin Only)
// ==========================================
// Get all users with filtering and pagination
router.get("/users", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllUsers(req, res, next));
// Get user statistics
router.get("/users/stats", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getUserAnalytics(req, res, next));
// Get specific user by ID
router.get("/users/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.getUserById(req, res, next));
// Create new user (admin/employee)
router.post("/users", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createUserSchema), (req, res, next) => adminController.createUser(req, res, next));
// Update user
router.put("/users/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateUserSchema), (req, res, next) => adminController.updateUser(req, res, next));
// Deactivate user
router.delete("/users/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.deactivateUser(req, res, next));
// Reset user password
router.post("/users/:id/reset-password", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.resetUserPasswordSchema), (req, res, next) => adminController.resetUserPassword(req, res, next));
// ==========================================
// STUDY PACK MANAGEMENT (Admin Only)
// ==========================================
// Get all study packs
router.get("/study-packs", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllStudyPacks(req, res, next));
// Create new study pack
router.post("/study-packs", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createStudyPackSchema), (req, res, next) => adminController.createStudyPack(req, res, next));
// Update study pack
router.put("/study-packs/:studyPackId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ studyPackId: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateStudyPackSchema), (req, res, next) => adminController.updateStudyPack(req, res, next));
// Delete study pack
router.delete("/study-packs/:studyPackId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ studyPackId: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.deleteStudyPack(req, res, next));
// ==========================================
// COURSE STRUCTURE MANAGEMENT
// ==========================================
// Create Unite (Admin Only)
router.post("/content/unites", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createUniteSchema), (req, res, next) => adminController.createUnite(req, res, next));
// Create Module (Admin Only)
router.post("/content/modules", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createModuleSchema), (req, res, next) => adminController.createModule(req, res, next));
// Create Course (Admin + Employee)
router.post("/content/courses", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(validation_middleware_1.courseSchema), (req, res, next) => adminController.createCourse(req, res, next));
// Update Unite (Admin Only)
router.put("/content/unites/:unitId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ unitId: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.createUniteSchema), (req, res, next) => adminController.updateUnite(req, res, next));
// Update Module (Admin Only)
router.put("/content/modules/:moduleId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ moduleId: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.createModuleSchema), (req, res, next) => adminController.updateModule(req, res, next));
// Update Course (Admin + Employee)
router.put("/content/courses/:courseId", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ courseId: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(validation_middleware_1.courseSchema), (req, res, next) => adminController.updateCourse(req, res, next));
// Delete Unite (Admin Only)
router.delete("/content/unites/:unitId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ unitId: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.deleteUnite(req, res, next));
// Delete Module (Admin Only)
router.delete("/content/modules/:moduleId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ moduleId: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.deleteModule(req, res, next));
// Delete Course (Admin + Employee)
router.delete("/content/courses/:courseId", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ courseId: zod_1.z.coerce.number().int().positive() }), (req, res, next) => adminController.deleteCourse(req, res, next));
// GET /admin/content/filters - Admin content filters (hierarchical structure)
router.get("/content/filters", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getAdminContentFilters(req, res, next));
// Create Course Resource (Admin + Employee)
router.post("/content/resources", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(validation_middleware_1.resourceSchema), (req, res, next) => adminController.createCourseResource(req, res, next));
// Update Course Resource (Admin + Employee)
router.put("/content/resources/:resourceId", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(validation_middleware_1.resourceSchema), (req, res, next) => adminController.updateCourseResource(req, res, next));
// Delete Course Resource (Admin + Employee)
router.delete("/content/resources/:resourceId", roleCheck_middleware_1.adminOrEmployee, (req, res, next) => adminController.deleteCourseResource(req, res, next));
// ==========================================
// QUIZ MANAGEMENT (Admin + Employee)
// ==========================================
// Get all quizzes with analytics
router.get("/quizzes", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllQuizzes(req, res, next));
// Create new quiz with questions and images
router.post("/quizzes", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(validation_middleware_1.employeeQuizSchema), (req, res, next) => adminController.createQuizWithQuestions(req, res, next));
// Update quiz
router.put("/quizzes/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(validation_middleware_1.employeeQuizSchema.partial()), (req, res, next) => adminController.updateQuiz(req, res, next));
// Delete quiz
router.delete("/quizzes/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteQuiz(req, res, next));
// ==========================================
// EXAM MANAGEMENT (Admin + Employee)
// ==========================================
// Get all exams
router.get("/exams", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllExams(req, res, next));
// Create new exam with questions and images
router.post("/exams", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(validation_middleware_1.employeeExamSchema), (req, res, next) => adminController.createExamWithQuestions(req, res, next));
// ==========================================
// QUESTION BANK MANAGEMENT
// ==========================================
// Get all questions (Admin Only)
router.get("/questions", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllQuestions(req, res, next));
// Get question reports for quality control (Admin + Employee)
router.get("/questions/reports", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getQuestionReports(req, res, next));
// Review question report (Admin + Employee)
router.put("/questions/reports/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.reviewQuestionReportSchema), (req, res, next) => adminController.reviewQuestionReport(req, res, next));
// ==========================================
// SUBSCRIPTION & PAYMENT MANAGEMENT (Admin Only)
// ==========================================
// Get all subscriptions with filtering
router.get("/subscriptions", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllSubscriptions(req, res, next));
// Update subscription status
router.put("/subscriptions/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateSubscriptionSchema), (req, res, next) => adminController.updateSubscription(req, res, next));
// Get subscription analytics
router.get("/subscriptions/stats", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getSubscriptionStats(req, res, next));
// Monthly subscription management endpoints
router.post("/subscriptions/:id/cancel", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.cancelSubscriptionSchema), (req, res, next) => adminController.cancelSubscription(req, res, next));
router.post("/subscriptions/:id/add-months", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.addMonthsSchema), (req, res, next) => adminController.addMonthsToSubscription(req, res, next));
router.post("/subscriptions/:id/activate", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: zod_1.z.coerce.number().int().positive() }), (0, validation_middleware_1.validateRequest)(admin_validation_1.activateSubscriptionSchema), (req, res, next) => adminController.activateSubscription(req, res, next));
// ==========================================
// UNIVERSITY & SPECIALTY MANAGEMENT (Canonical spec)
// ==========================================
// GET /admin/universities - List universities with pagination
router.get("/universities", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), (req, res, next) => adminController.getAllUniversities(req, res, next));
// POST /admin/universities - Create university
router.post("/universities", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createUniversitySchema), (req, res, next) => adminController.createUniversity(req, res, next));
// PUT /admin/universities/:universityId - Update university
router.put("/universities/:universityId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ universityId: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateUniversitySchema), (req, res, next) => adminController.updateUniversity(req, res, next));
// DELETE /admin/universities/:universityId - Delete university
router.delete("/universities/:universityId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ universityId: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteUniversity(req, res, next));
// GET /admin/specialties - List specialties with pagination
router.get("/specialties", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), (req, res, next) => adminController.getAllSpecialties(req, res, next));
// POST /admin/specialties - Create specialty
router.post("/specialties", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createSpecialtySchema), (req, res, next) => adminController.createSpecialty(req, res, next));
// PUT /admin/specialties/:specialtyId - Update specialty
router.put("/specialties/:specialtyId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ specialtyId: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateSpecialtySchema), (req, res, next) => adminController.updateSpecialty(req, res, next));
// DELETE /admin/specialties/:specialtyId - Delete specialty
router.delete("/specialties/:specialtyId", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ specialtyId: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteSpecialty(req, res, next));
// ==========================================
// QUESTION SOURCE MANAGEMENT (Admin + Employee)
// ==========================================
// Get all question sources
router.get("/question-sources", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validatePagination)(true), // Use admin pagination limits
(req, res, next) => adminController.getAllQuestionSources(req, res, next));
// Create new question source
router.post("/question-sources", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateRequest)(admin_validation_1.createQuestionSourceSchema), (req, res, next) => adminController.createQuestionSource(req, res, next));
// Get question source by ID
router.get("/question-sources/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.getQuestionSourceById(req, res, next));
// Update question source
router.put("/question-sources/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateQuestionSourceSchema), (req, res, next) => adminController.updateQuestionSource(req, res, next));
// Delete question source
router.delete("/question-sources/:id", roleCheck_middleware_1.adminOrEmployee, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteQuestionSource(req, res, next));
// ==========================================
// ACTIVATION CODE MANAGEMENT (Admin Only - Canonical spec)
// ==========================================
// POST /admin/activation-codes - Create activation code
router.post("/activation-codes", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createActivationCodeSchema), (req, res, next) => adminController.createActivationCode(req, res, next));
// GET /admin/activation-codes - Get all activation codes with filtering
router.get("/activation-codes", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validatePagination)(true), (req, res, next) => adminController.getAllActivationCodes(req, res, next));
// GET /admin/activation-codes/:id - Get activation code by ID
router.get("/activation-codes/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.getActivationCodeById(req, res, next));
// PUT /admin/activation-codes/:id - Update activation code
router.put("/activation-codes/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateActivationCodeSchema), (req, res, next) => adminController.updateActivationCode(req, res, next));
// DELETE /admin/activation-codes/:id - Delete activation code
router.delete("/activation-codes/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteActivationCode(req, res, next));
// PATCH /admin/activation-codes/:id/deactivate - Deactivate activation code
router.patch("/activation-codes/:id/deactivate", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.deactivateActivationCode(req, res, next));
// ==========================================
// RESIDENCY QUESTION MANAGEMENT (Canonical spec)
// ==========================================
// GET /admin/residency-questions - List residency questions with filters
router.get("/residency-questions", roleCheck_middleware_1.adminOnly, (req, res, next) => adminController.getResidencyQuestions(req, res, next));
// GET /admin/residency-questions/:id - Get single residency question
router.get("/residency-questions/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.getResidencyQuestionById(req, res, next));
// POST /admin/residency-questions/bulk - Bulk create residency questions
router.post("/residency-questions/bulk", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.bulkCreateResidencyQuestionsSchema), (req, res, next) => adminController.bulkCreateResidencyQuestions(req, res, next));
// POST /admin/residency-questions - Create residency question
router.post("/residency-questions", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateRequest)(admin_validation_1.createResidencyQuestionSchema), (req, res, next) => adminController.createResidencyQuestion(req, res, next));
// PUT /admin/residency-questions/:id - Update residency question
router.put("/residency-questions/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (0, validation_middleware_1.validateRequest)(admin_validation_1.updateResidencyQuestionSchema), (req, res, next) => adminController.updateResidencyQuestion(req, res, next));
// DELETE /admin/residency-questions/:id - Delete residency question
router.delete("/residency-questions/:id", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.deleteResidencyQuestion(req, res, next));
// ==========================================
// MODULE BOOKS MANAGEMENT (Admin Only)
// ==========================================
// GET /admin/modules/:id/books - Get all books for a module
router.get("/modules/:id/books", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.getModuleBooks(req, res, next));
// POST /admin/modules/:id/books - Bulk create books for a module
router.post("/modules/:id/books", roleCheck_middleware_1.adminOnly, (0, validation_middleware_1.validateParams)({ id: validation_middleware_1.idSchema }), (req, res, next) => adminController.createModuleBooks(req, res, next));
// ==========================================
// UNIFIED QUESTION MANAGEMENT (Admin + Employee)
// ==========================================
// Mount question management routes
router.use("/questions", question_routes_1.default);
// ==========================================
// QUESTION IMAGE MANAGEMENT (Admin + Employee)
// ==========================================
// PUT /admin/image/:questionId/question-images - Replace question images
router.put("/image/:questionId/question-images", roleCheck_middleware_1.adminOrEmployee, mediaHandler.uploadMultipleFiles(media_utils_1.FileType.IMAGE, 'questionImages', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const questionId = parseInt(req.params.questionId);
        if (isNaN(questionId)) {
            throw new AppError_1.BadRequestError("Valid question ID is required");
        }
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError("No image files uploaded");
        }
        // Convert uploaded files to image data
        const images = files.map(file => ({
            imagePath: `/uploads/images/${file.filename}`,
            altText: null
        }));
        const result = yield questionService.replaceQuestionImages(questionId, images);
        res.json(result);
    }
    catch (error) {
        next(error);
    }
}));
// PUT /admin/image/:questionId/explanation-images - Replace explanation images
router.put("/image/:questionId/explanation-images", roleCheck_middleware_1.adminOrEmployee, mediaHandler.uploadMultipleFiles(media_utils_1.FileType.EXPLANATION, 'explanationImages', 10), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const questionId = parseInt(req.params.questionId);
        if (isNaN(questionId)) {
            throw new AppError_1.BadRequestError("Valid question ID is required");
        }
        const files = req.files;
        if (!files || files.length === 0) {
            throw new AppError_1.BadRequestError("No image files uploaded");
        }
        // Convert uploaded files to image data
        const images = files.map(file => ({
            imagePath: `/uploads/explanations/${file.filename}`,
            altText: null
        }));
        const result = yield questionService.replaceExplanationImages(questionId, images);
        res.json(result);
    }
    catch (error) {
        next(error);
    }
}));
// ==========================================
// FILE UPLOAD ROUTES (Admin + Employee)
// ==========================================
// Mount upload routes
router.use("/upload", upload_routes_1.default);
exports.default = router;
