import { Router, Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { z } from "zod";
import AdminController from "./admin.controller";
import uploadRoutes from "./upload.routes";
import questionRoutes from "../questions/question.routes";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { adminOnly, adminOrEmployee } from "../../core/middlewares/roleCheck.middleware";
import MediaHandler, { FileType } from "../../core/utils/media.utils";
import QuestionService from "../questions/question.service";
import { NotFoundError, BadRequestError } from "../../core/errors/AppError";
import {
  validateRequest,
  validateParams,
  validatePagination,
  createQuizSessionSchema,
  createExamSessionSchema,
  courseSchema,
  resourceSchema,
  employeeQuizSchema,
  employeeExamSchema,
  idSchema
} from "../../middleware/validation.middleware";
import {
  createUniteSchema,
  createModuleSchema,
  createSubModuleSchema,
  createUserSchema,
  updateUserSchema,
  createStudyPackSchema,
  updateStudyPackSchema,
  resetUserPasswordSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  addMonthsSchema,
  activateSubscriptionSchema,
  reviewQuestionReportSchema,
  createUniversitySchema,
  updateUniversitySchema,
  createSpecialtySchema,
  updateSpecialtySchema,
  createQuestionSourceSchema,
  updateQuestionSourceSchema,
  createActivationCodeSchema,
  updateActivationCodeSchema,
  getActivationCodesSchema,
  createResidencyQuestionSchema,
  updateResidencyQuestionSchema,
  bulkCreateResidencyQuestionsSchema,
  createBooksSchema
} from "./validations/admin.validation";

const router = Router();
const adminController = container.resolve(AdminController);
const mediaHandler = container.resolve<MediaHandler>("mediaHandler");
const questionService = container.resolve(QuestionService);

// Apply authentication to all routes
router.use(authMiddleware);

// ==========================================
// DASHBOARD & ANALYTICS (Admin Only)
// ==========================================

// Dashboard stats
router.get("/dashboard/stats",
  adminOnly,
  (req, res, next) => adminController.getDashboardStats(req, res, next)
);

// User analytics
router.get("/analytics/users",
  adminOnly,
  (req, res, next) => adminController.getUserAnalytics(req, res, next)
);

// ==========================================
// USER MANAGEMENT (Admin Only)
// ==========================================

// Get all users with filtering and pagination
router.get("/users",
  adminOnly,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllUsers(req, res, next)
);

// Get user statistics
router.get("/users/stats",
  adminOnly,
  (req, res, next) => adminController.getUserAnalytics(req, res, next)
);

// Get specific user by ID
router.get("/users/:id",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.getUserById(req, res, next)
);

// Create new user (admin/employee)
router.post("/users",
  adminOnly,
  validateRequest(createUserSchema),
  (req, res, next) => adminController.createUser(req, res, next)
);

// Update user
router.put("/users/:id",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(updateUserSchema),
  (req, res, next) => adminController.updateUser(req, res, next)
);

// Deactivate user
router.delete("/users/:id",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.deactivateUser(req, res, next)
);

// Reset user password
router.post("/users/:id/reset-password",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(resetUserPasswordSchema),
  (req, res, next) => adminController.resetUserPassword(req, res, next)
);

// ==========================================
// STUDY PACK MANAGEMENT (Admin Only)
// ==========================================

// Get all study packs
router.get("/study-packs",
  adminOnly,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllStudyPacks(req, res, next)
);

// Create new study pack
router.post("/study-packs",
  adminOnly,
  validateRequest(createStudyPackSchema),
  (req, res, next) => adminController.createStudyPack(req, res, next)
);

// Update study pack
router.put("/study-packs/:studyPackId",
  adminOnly,
  validateParams({ studyPackId: z.coerce.number().int().positive() }),
  validateRequest(updateStudyPackSchema),
  (req, res, next) => adminController.updateStudyPack(req, res, next)
);

// Delete study pack
router.delete("/study-packs/:studyPackId",
  adminOnly,
  validateParams({ studyPackId: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.deleteStudyPack(req, res, next)
);

// ==========================================
// COURSE STRUCTURE MANAGEMENT
// ==========================================

// Create Unite (Admin Only)
router.post("/content/unites",
  adminOnly,
  validateRequest(createUniteSchema),
  (req, res, next) => adminController.createUnite(req, res, next)
);

// Create Module (Admin Only)
router.post("/content/modules",
  adminOnly,
  validateRequest(createModuleSchema),
  (req, res, next) => adminController.createModule(req, res, next)
);

// Create SubModule (Admin Only)
router.post("/content/sub-modules",
  adminOnly,
  validateRequest(createSubModuleSchema),
  (req, res, next) => adminController.createSubModule(req, res, next)
);

// Create Course (Admin + Employee)
router.post("/content/courses",
  adminOrEmployee,
  validateRequest(courseSchema),
  (req, res, next) => adminController.createCourse(req, res, next)
);

// Update Unite (Admin Only)
router.put("/content/unites/:unitId",
  adminOnly,
  validateParams({ unitId: z.coerce.number().int().positive() }),
  validateRequest(createUniteSchema),
  (req, res, next) => adminController.updateUnite(req, res, next)
);

// Update Module (Admin Only)
router.put("/content/modules/:moduleId",
  adminOnly,
  validateParams({ moduleId: z.coerce.number().int().positive() }),
  validateRequest(createModuleSchema),
  (req, res, next) => adminController.updateModule(req, res, next)
);

// Update Course (Admin + Employee)
router.put("/content/courses/:courseId",
  adminOrEmployee,
  validateParams({ courseId: z.coerce.number().int().positive() }),
  validateRequest(courseSchema),
  (req, res, next) => adminController.updateCourse(req, res, next)
);

// Delete Unite (Admin Only)
router.delete("/content/unites/:unitId",
  adminOnly,
  validateParams({ unitId: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.deleteUnite(req, res, next)
);

// Delete Module (Admin Only)
router.delete("/content/modules/:moduleId",
  adminOnly,
  validateParams({ moduleId: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.deleteModule(req, res, next)
);

// Delete Course (Admin + Employee)
router.delete("/content/courses/:courseId",
  adminOrEmployee,
  validateParams({ courseId: z.coerce.number().int().positive() }),
  (req, res, next) => adminController.deleteCourse(req, res, next)
);

// GET /admin/content/filters - Admin content filters (hierarchical structure)
router.get("/content/filters",
  adminOnly,
  (req, res, next) => adminController.getAdminContentFilters(req, res, next)
);

// Create Course Resource (Admin + Employee)
router.post("/content/resources",
  adminOrEmployee,
  validateRequest(resourceSchema),
  (req, res, next) => adminController.createCourseResource(req, res, next)
);

// Update Course Resource (Admin + Employee)
router.put("/content/resources/:resourceId",
  adminOrEmployee,
  validateRequest(resourceSchema),
  (req, res, next) => adminController.updateCourseResource(req, res, next)
);

// Delete Course Resource (Admin + Employee)
router.delete("/content/resources/:resourceId",
  adminOrEmployee,
  (req, res, next) => adminController.deleteCourseResource(req, res, next)
);

// ==========================================
// QUIZ MANAGEMENT (Admin + Employee)
// ==========================================

// Get all quizzes with analytics
router.get("/quizzes",
  adminOrEmployee,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllQuizzes(req, res, next)
);

// Create new quiz with questions and images
router.post("/quizzes",
  adminOrEmployee,
  validateRequest(employeeQuizSchema),
  (req, res, next) => adminController.createQuizWithQuestions(req, res, next)
);

// Update quiz
router.put("/quizzes/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  validateRequest(employeeQuizSchema.partial()),
  (req, res, next) => adminController.updateQuiz(req, res, next)
);

// Delete quiz
router.delete("/quizzes/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.deleteQuiz(req, res, next)
);

// ==========================================
// EXAM MANAGEMENT (Admin + Employee)
// ==========================================

// Get all exams
router.get("/exams",
  adminOrEmployee,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllExams(req, res, next)
);

// Create new exam with questions and images
router.post("/exams",
  adminOrEmployee,
  validateRequest(employeeExamSchema),
  (req, res, next) => adminController.createExamWithQuestions(req, res, next)
);

// ==========================================
// QUESTION BANK MANAGEMENT
// ==========================================

// Get all questions (Admin Only)
router.get("/questions",
  adminOnly,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllQuestions(req, res, next)
);

// Get question reports for quality control (Admin + Employee)
router.get("/questions/reports",
  adminOrEmployee,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getQuestionReports(req, res, next)
);

// Review question report (Admin + Employee)
router.put("/questions/reports/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  validateRequest(reviewQuestionReportSchema),
  (req, res, next) => adminController.reviewQuestionReport(req, res, next)
);

// ==========================================
// SUBSCRIPTION & PAYMENT MANAGEMENT (Admin Only)
// ==========================================

// Get all subscriptions with filtering
router.get("/subscriptions",
  adminOnly,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllSubscriptions(req, res, next)
);

// Update subscription status
router.put("/subscriptions/:id",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(updateSubscriptionSchema),
  (req, res, next) => adminController.updateSubscription(req, res, next)
);

// Get subscription analytics
router.get("/subscriptions/stats",
  adminOnly,
  (req, res, next) => adminController.getSubscriptionStats(req, res, next)
);

// Monthly subscription management endpoints
router.post("/subscriptions/:id/cancel",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(cancelSubscriptionSchema),
  (req, res, next) => adminController.cancelSubscription(req, res, next)
);

router.post("/subscriptions/:id/add-months",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(addMonthsSchema),
  (req, res, next) => adminController.addMonthsToSubscription(req, res, next)
);

router.post("/subscriptions/:id/activate",
  adminOnly,
  validateParams({ id: z.coerce.number().int().positive() }),
  validateRequest(activateSubscriptionSchema),
  (req, res, next) => adminController.activateSubscription(req, res, next)
);

// ==========================================
// UNIVERSITY & SPECIALTY MANAGEMENT (Canonical spec)
// ==========================================

// GET /admin/universities - List universities with pagination
router.get("/universities",
  adminOnly,
  validatePagination(true),
  (req, res, next) => adminController.getAllUniversities(req, res, next)
);

// POST /admin/universities - Create university
router.post("/universities",
  adminOnly,
  validateRequest(createUniversitySchema),
  (req, res, next) => adminController.createUniversity(req, res, next)
);

// PUT /admin/universities/:universityId - Update university
router.put("/universities/:universityId",
  adminOnly,
  validateParams({ universityId: idSchema }),
  validateRequest(updateUniversitySchema),
  (req, res, next) => adminController.updateUniversity(req, res, next)
);

// DELETE /admin/universities/:universityId - Delete university
router.delete("/universities/:universityId",
  adminOnly,
  validateParams({ universityId: idSchema }),
  (req, res, next) => adminController.deleteUniversity(req, res, next)
);

// GET /admin/specialties - List specialties with pagination
router.get("/specialties",
  adminOnly,
  validatePagination(true),
  (req, res, next) => adminController.getAllSpecialties(req, res, next)
);

// POST /admin/specialties - Create specialty
router.post("/specialties",
  adminOnly,
  validateRequest(createSpecialtySchema),
  (req, res, next) => adminController.createSpecialty(req, res, next)
);

// PUT /admin/specialties/:specialtyId - Update specialty
router.put("/specialties/:specialtyId",
  adminOnly,
  validateParams({ specialtyId: idSchema }),
  validateRequest(updateSpecialtySchema),
  (req, res, next) => adminController.updateSpecialty(req, res, next)
);

// DELETE /admin/specialties/:specialtyId - Delete specialty
router.delete("/specialties/:specialtyId",
  adminOnly,
  validateParams({ specialtyId: idSchema }),
  (req, res, next) => adminController.deleteSpecialty(req, res, next)
);

// ==========================================
// QUESTION SOURCE MANAGEMENT (Admin + Employee)
// ==========================================

// Get all question sources
router.get("/question-sources",
  adminOrEmployee,
  validatePagination(true), // Use admin pagination limits
  (req, res, next) => adminController.getAllQuestionSources(req, res, next)
);

// Create new question source
router.post("/question-sources",
  adminOrEmployee,
  validateRequest(createQuestionSourceSchema),
  (req, res, next) => adminController.createQuestionSource(req, res, next)
);

// Get question source by ID
router.get("/question-sources/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.getQuestionSourceById(req, res, next)
);

// Update question source
router.put("/question-sources/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  validateRequest(updateQuestionSourceSchema),
  (req, res, next) => adminController.updateQuestionSource(req, res, next)
);

// Delete question source
router.delete("/question-sources/:id",
  adminOrEmployee,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.deleteQuestionSource(req, res, next)
);

// ==========================================
// ACTIVATION CODE MANAGEMENT (Admin Only - Canonical spec)
// ==========================================

// POST /admin/activation-codes - Create activation code
router.post("/activation-codes",
  adminOnly,
  validateRequest(createActivationCodeSchema),
  (req, res, next) => adminController.createActivationCode(req, res, next)
);

// GET /admin/activation-codes - Get all activation codes with filtering
router.get("/activation-codes",
  adminOnly,
  validatePagination(true),
  (req, res, next) => adminController.getAllActivationCodes(req, res, next)
);

// GET /admin/activation-codes/:id - Get activation code by ID
router.get("/activation-codes/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.getActivationCodeById(req, res, next)
);

// PUT /admin/activation-codes/:id - Update activation code
router.put("/activation-codes/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  validateRequest(updateActivationCodeSchema),
  (req, res, next) => adminController.updateActivationCode(req, res, next)
);

// DELETE /admin/activation-codes/:id - Delete activation code
router.delete("/activation-codes/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.deleteActivationCode(req, res, next)
);

// PATCH /admin/activation-codes/:id/deactivate - Deactivate activation code
router.patch("/activation-codes/:id/deactivate",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.deactivateActivationCode(req, res, next)
);

// ==========================================
// RESIDENCY QUESTION MANAGEMENT (Canonical spec)
// ==========================================

// The residency create/update/bulk routes take JSON only. A multipart body (sent when
// images are attached) would otherwise reach validation empty; images go through
// PUT /admin/image/:questionId/question-images and /explanation-images instead.
const residencyJsonOnly = (req: Request, _res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    return next(new BadRequestError(
      "Send residency questions as JSON. Upload images afterwards through PUT /admin/image/:questionId/question-images or /explanation-images."
    ));
  }
  next();
};

// GET /admin/residency-questions - List residency questions with filters
router.get("/residency-questions",
  adminOnly,
  (req, res, next) => adminController.getResidencyQuestions(req, res, next)
);

// GET /admin/residency-questions/:id - Get single residency question
router.get("/residency-questions/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.getResidencyQuestionById(req, res, next)
);

// POST /admin/residency-questions/bulk - Bulk create residency questions
router.post("/residency-questions/bulk",
  adminOnly,
  residencyJsonOnly,
  validateRequest(bulkCreateResidencyQuestionsSchema),
  (req, res, next) => adminController.bulkCreateResidencyQuestions(req, res, next)
);

// POST /admin/residency-questions - Create residency question
router.post("/residency-questions",
  adminOnly,
  residencyJsonOnly,
  validateRequest(createResidencyQuestionSchema),
  (req, res, next) => adminController.createResidencyQuestion(req, res, next)
);

// PUT /admin/residency-questions/:id - Update residency question
router.put("/residency-questions/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  residencyJsonOnly,
  validateRequest(updateResidencyQuestionSchema),
  (req, res, next) => adminController.updateResidencyQuestion(req, res, next)
);

// DELETE /admin/residency-questions/:id - Delete residency question
router.delete("/residency-questions/:id",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.deleteResidencyQuestion(req, res, next)
);

// ==========================================
// MODULE BOOKS MANAGEMENT (Admin Only)
// ==========================================

// GET /admin/modules/:id/books - Get all books for a module
router.get("/modules/:id/books",
  adminOnly,
  validateParams({ id: idSchema }),
  (req, res, next) => adminController.getModuleBooks(req, res, next)
);

// POST /admin/modules/:id/books - Bulk create books for a module
router.post("/modules/:id/books",
  adminOnly,
  validateParams({ id: idSchema }),
  validateRequest(createBooksSchema),
  (req, res, next) => adminController.createModuleBooks(req, res, next)
);

// POST /admin/sub-modules/:id/books - Bulk create books for a sub-module
router.post("/sub-modules/:id/books",
  adminOnly,
  validateParams({ id: idSchema }),
  validateRequest(createBooksSchema),
  (req, res, next) => adminController.createSubModuleBooks(req, res, next)
);

// ==========================================
// UNIFIED QUESTION MANAGEMENT (Admin + Employee)
// ==========================================

// Mount question management routes
router.use("/questions", questionRoutes);

// ==========================================
// QUESTION IMAGE MANAGEMENT (Admin + Employee)
// ==========================================

// PUT /admin/image/:questionId/question-images - Replace question images
router.put("/image/:questionId/question-images",
  adminOrEmployee,
  mediaHandler.uploadMultipleFiles(FileType.IMAGE, 'questionImages', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const questionId = parseInt(req.params.questionId);
      if (isNaN(questionId)) {
        throw new BadRequestError("Valid question ID is required");
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError("No image files uploaded");
      }

      // Convert uploaded files to image data
      const images = files.map(file => ({
        imagePath: `/uploads/images/${file.filename}`,
        altText: null
      }));

      const result = await questionService.replaceQuestionImages(questionId, images);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /admin/image/:questionId/explanation-images - Replace explanation images
router.put("/image/:questionId/explanation-images",
  adminOrEmployee,
  mediaHandler.uploadMultipleFiles(FileType.EXPLANATION, 'explanationImages', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const questionId = parseInt(req.params.questionId);
      if (isNaN(questionId)) {
        throw new BadRequestError("Valid question ID is required");
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError("No image files uploaded");
      }

      // Convert uploaded files to image data
      const images = files.map(file => ({
        imagePath: `/uploads/explanations/${file.filename}`,
        altText: null
      }));

      const result = await questionService.replaceExplanationImages(questionId, images);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// FILE UPLOAD ROUTES (Admin + Employee)
// ==========================================

// Mount upload routes
router.use("/upload", uploadRoutes);

export default router;