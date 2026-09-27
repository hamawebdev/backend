import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import AdminService from "./admin.service";
import ResponseUtils from "../../core/utils/response.utils";
import { RequestWithUser } from "../../types/types";
import { ActivationCodeService } from "./services/activation-code.service";
import { normalizeResidencyPart } from "./validations/admin.validation";

@injectable()
export default class AdminController {
  constructor(
    @inject(AdminService) private adminService: AdminService,
    @inject(ResponseUtils) private responseUtils: ResponseUtils,
    @inject(ActivationCodeService) private activationCodeService: ActivationCodeService
  ) { }

  // ==========================================
  // DASHBOARD & ANALYTICS
  // ==========================================

  async getDashboardStats(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await this.adminService.getDashboardStats();
      this.responseUtils.sendSuccessResponse(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async getUserAnalytics(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { timeframe } = req.query;
      const analytics = await this.adminService.getUserAnalytics(timeframe as string);
      this.responseUtils.sendSuccessResponse(res, analytics);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async getAllUsers(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const filters = {
        page: (req.query as any).page as number, // Already validated and converted by middleware
        limit: (req.query as any).limit as number, // Already validated and converted by middleware
        role: req.query.role as any,
        universityId: req.query.universityId ? parseInt(req.query.universityId as string) : undefined,
        specialtyId: req.query.specialtyId ? parseInt(req.query.specialtyId as string) : undefined,
        currentYear: req.query.currentYear as any,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        search: req.query.search as string
      };

      const result = await this.adminService.getAllUsers(filters);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const user = await this.adminService.getUserById(userId);
      this.responseUtils.sendSuccessResponse(res, user);
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const user = await this.adminService.createUser(req.body, createdById);

      // Canonical: Return user object directly with 201 (no message wrapper)
      const { passwordHash, ...userWithoutPassword } = user;
      res.status(201).json({
        id: userWithoutPassword.id,
        email: userWithoutPassword.email,
        fullName: userWithoutPassword.fullName,
        role: userWithoutPassword.role,
        universityId: userWithoutPassword.universityId,
        specialtyId: userWithoutPassword.specialtyId,
        currentYear: userWithoutPassword.currentYear,
        isActive: userWithoutPassword.isActive,
        createdAt: userWithoutPassword.createdAt
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;
      const user = await this.adminService.updateUser(userId, req.body, updatedById);

      // Canonical: Return user object directly with updatedAt (no message wrapper)
      const { passwordHash, ...userWithoutPassword } = user;
      res.status(200).json({
        id: userWithoutPassword.id,
        email: userWithoutPassword.email,
        fullName: userWithoutPassword.fullName,
        role: userWithoutPassword.role,
        universityId: userWithoutPassword.universityId,
        specialtyId: userWithoutPassword.specialtyId,
        currentYear: userWithoutPassword.currentYear,
        isActive: userWithoutPassword.isActive,
        createdAt: userWithoutPassword.createdAt,
        updatedAt: userWithoutPassword.updatedAt
      });
    } catch (error) {
      next(error);
    }
  }

  async deactivateUser(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const deactivatedById = req.user!.user_data.id;
      await this.adminService.deactivateUser(userId, deactivatedById);

      // Canonical: "User deleted successfully" message
      res.status(200).json({
        message: "User deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  async resetUserPassword(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;
      const resetById = req.user!.user_data.id;

      await this.adminService.resetUserPassword(userId, newPassword, resetById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Password reset successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // STUDY PACK MANAGEMENT
  // ==========================================

  async getAllStudyPacks(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      const result = await this.adminService.getAllStudyPacksCanonical(page, limit);
      // Canonical: Return {items, total, page, limit, totalPages}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createStudyPack(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const studyPack = await this.adminService.createStudyPackCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(studyPack);
    } catch (error) {
      next(error);
    }
  }

  async updateStudyPack(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.studyPackId);
      const updatedById = req.user!.user_data.id;
      const studyPack = await this.adminService.updateStudyPackCanonical(id, req.body, updatedById);

      // Canonical: Return flat object directly with updatedAt
      res.status(200).json(studyPack);
    } catch (error) {
      next(error);
    }
  }

  async deleteStudyPack(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.studyPackId);
      const deletedById = req.user!.user_data.id;
      await this.adminService.deleteStudyPack(id, deletedById);

      // Canonical: Return {message}
      res.status(200).json({
        message: "Study pack deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // COURSE STRUCTURE MANAGEMENT
  // ==========================================

  async createUnite(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const unite = await this.adminService.createUniteCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(unite);
    } catch (error) {
      next(error);
    }
  }

  async createModule(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const module = await this.adminService.createModuleCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(module);
    } catch (error) {
      next(error);
    }
  }

  async createSubModule(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const subModule = await this.adminService.createSubModuleCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(subModule);
    } catch (error) {
      next(error);
    }
  }

  async createCourse(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const course = await this.adminService.createCourseCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(course);
    } catch (error) {
      next(error);
    }
  }

  async createCourseResource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const resource = await this.adminService.createCourseResource(req.body, createdById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Resource created successfully",
        resource
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/content/filters
   * Returns hierarchical content structure for admin filtering
   * Optional filters: isResidency, yearLevel
   */
  async getAdminContentFilters(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        isResidency: req.query.isResidency === 'true' ? true : req.query.isResidency === 'false' ? false : undefined,
        yearLevel: req.query.yearLevel as string | undefined
      };

      const result = await this.adminService.getAdminContentFilters(filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // UPDATE OPERATIONS
  // ==========================================

  async updateUnite(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.unitId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid unite ID is required");
        return;
      }

      const updatedUnite = await this.adminService.updateUniteCanonical(id, req.body);

      // Canonical: Return flat object directly with updatedAt
      res.status(200).json(updatedUnite);
    } catch (error) {
      next(error);
    }
  }

  async updateModule(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.moduleId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
        return;
      }

      const updatedModule = await this.adminService.updateModuleCanonical(id, req.body);

      // Canonical: Return flat object directly with updatedAt
      res.status(200).json(updatedModule);
    } catch (error) {
      next(error);
    }
  }

  async updateCourse(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.courseId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const updatedCourse = await this.adminService.updateCourseCanonical(id, req.body);

      // Canonical: Return flat object directly with updatedAt
      res.status(200).json(updatedCourse);
    } catch (error) {
      next(error);
    }
  }

  async updateCourseResource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.resourceId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course resource ID is required");
        return;
      }

      const updatedResource = await this.adminService.updateCourseResource(id, req.body);

      // Canonical: return flat resource object (no message wrapper)
      res.json(updatedResource);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DELETE OPERATIONS
  // ==========================================

  async deleteUnite(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.unitId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid unite ID is required");
        return;
      }

      const result = await this.adminService.deleteUnite(id);

      // Canonical: Return {message}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteModule(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.moduleId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
        return;
      }

      const result = await this.adminService.deleteModule(id);

      // Canonical: Return {message}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteCourse(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.courseId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const result = await this.adminService.deleteCourse(id);

      // Canonical: Return {message}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteCourseResource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.resourceId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course resource ID is required");
        return;
      }

      const result = await this.adminService.deleteCourseResource(id);

      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // QUIZ MANAGEMENT
  // ==========================================

  async getAllQuizzes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      const result = await this.adminService.getAllQuizzes(page, limit);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async createQuizWithQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const quiz = await this.adminService.createQuizWithQuestions(req.body, createdById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Quiz created successfully with questions",
        quiz
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  async updateQuiz(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;
      const quiz = await this.adminService.updateQuiz(id, req.body, updatedById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Quiz updated successfully",
        quiz
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteQuiz(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const deletedById = req.user!.user_data.id;
      await this.adminService.deleteQuiz(id, deletedById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Quiz deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // EXAM MANAGEMENT
  // ==========================================

  async getAllExams(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      const result = await this.adminService.getAllExams(page, limit);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async createExamWithQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const exam = await this.adminService.createExamWithQuestions(req.body, createdById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Exam created successfully with questions",
        exam
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // QUESTION MANAGEMENT
  // ==========================================

  async getAllQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      // Extract filters from query params
      const filters = {
        courseId: req.query.courseId ? parseInt(req.query.courseId as string) : undefined,
        moduleId: req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined,
        questionType: req.query.questionType as string | undefined,
        yearLevel: req.query.yearLevel as string | undefined,
        examYear: req.query.examYear ? parseInt(req.query.examYear as string) : undefined,
        sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
        search: req.query.search as string | undefined
      };

      const result = await this.adminService.getAllQuestions(page, limit, filters);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getQuestionReports(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      // Extract all canonical filters
      const filters = {
        status: req.query.status as string | undefined,
        reportType: req.query.reportType as string | undefined,
        questionId: req.query.questionId ? parseInt(req.query.questionId as string) : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        search: req.query.search as string | undefined
      };

      const result = await this.adminService.getQuestionReportsCanonical(page, limit, filters);

      // Canonical: Return items with pagination directly
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async reviewQuestionReport(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const reportId = parseInt(req.params.id);
      const reviewerId = req.user!.user_data.id;
      const { status, adminNotes } = req.body;

      const report = await this.adminService.reviewQuestionReportCanonical(reportId, reviewerId, { status, adminNotes });

      // Canonical: Return report object directly (no message wrapper)
      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  async getAllSubscriptions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        // Use validated pagination parameters from middleware
        page: (req.query as any).page as number,
        limit: (req.query as any).limit as number,
        status: req.query.status as any,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        studyPackId: req.query.studyPackId ? parseInt(req.query.studyPackId as string) : undefined,
      };

      const result = await this.adminService.getAllSubscriptions(filters);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async updateSubscription(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;
      const { status, endDate } = req.body;

      // Use canonical service method
      const subscription = await this.adminService.updateSubscriptionCanonical(id, { status, endDate }, updatedById);

      // Canonical: Return subscription object directly (no message wrapper)
      res.status(200).json(subscription);
    } catch (error) {
      next(error);
    }
  }

  async getSubscriptionStats(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await this.adminService.getSubscriptionStats();
      this.responseUtils.sendSuccessResponse(res, stats);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // MONTHLY SUBSCRIPTION MANAGEMENT
  // ==========================================

  async cancelSubscription(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      const cancelledById = req.user!.user_data.id;

      // Use canonical service method
      const result = await this.adminService.cancelSubscriptionCanonical(id, reason, cancelledById);

      // Canonical: Return {id, status, cancellationDate, cancellationReason}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async addMonthsToSubscription(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { months, reason } = req.body;
      const updatedById = req.user!.user_data.id;

      // Use canonical service method
      const subscription = await this.adminService.addMonthsToSubscriptionCanonical(id, months, reason, updatedById);

      // Canonical: Return subscription object directly (no message wrapper)
      res.status(200).json(subscription);
    } catch (error) {
      next(error);
    }
  }

  async activateSubscription(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { startDate, endDate, reason } = req.body;
      const activatedById = req.user!.user_data.id;

      const subscription = await this.adminService.activateSubscription(id, startDate, endDate, reason, activatedById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Subscription activated successfully",
        subscription
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // UNIVERSITY & SPECIALTY MANAGEMENT (Canonical spec)
  // ==========================================

  /**
   * GET /admin/universities
   * Paginated list with optional filters (search, country)
   * Returns: {items, total, page, limit, totalPages}
   */
  async getAllUniversities(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        search: req.query.search as string | undefined,
        country: req.query.country as string | undefined
      };

      const result = await this.adminService.getAllUniversitiesCanonical(filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/universities
   * Create university - returns flat object directly with 201
   */
  async createUniversity(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const university = await this.adminService.createUniversityCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(university);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/universities/:universityId
   * Update university - returns flat object with updatedAt
   */
  async updateUniversity(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.universityId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid university ID is required");
        return;
      }

      const updatedById = req.user!.user_data.id;
      const university = await this.adminService.updateUniversity(id, req.body, updatedById);

      // Canonical: Return flat object directly
      res.status(200).json(university);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/universities/:universityId
   * Delete university - returns {message}
   */
  async deleteUniversity(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.universityId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid university ID is required");
        return;
      }

      const deletedById = req.user!.user_data.id;
      const result = await this.adminService.deleteUniversity(id, deletedById);

      // Canonical: Return {message}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/specialties
   * Paginated list with optional search filter
   * Returns: {items, total, page, limit, totalPages}
   */
  async getAllSpecialties(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        search: req.query.search as string | undefined
      };

      const result = await this.adminService.getAllSpecialtiesCanonical(filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/specialties
   * Create specialty - returns flat object directly with 201
   */
  async createSpecialty(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const specialty = await this.adminService.createSpecialtyCanonical(req.body, createdById);

      // Canonical: Return flat object directly with 201 status
      res.status(201).json(specialty);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/specialties/:specialtyId
   * Update specialty - returns flat object with updatedAt
   */
  async updateSpecialty(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.specialtyId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid specialty ID is required");
        return;
      }

      const updatedById = req.user!.user_data.id;
      const specialty = await this.adminService.updateSpecialty(id, req.body, updatedById);

      // Canonical: Return flat object directly
      res.status(200).json(specialty);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/specialties/:specialtyId
   * Delete specialty - returns {message}
   */
  async deleteSpecialty(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.specialtyId);
      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid specialty ID is required");
        return;
      }

      const deletedById = req.user!.user_data.id;
      const result = await this.adminService.deleteSpecialty(id, deletedById);

      // Canonical: Return {message}
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // QUESTION SOURCE MANAGEMENT
  // ==========================================

  async getAllQuestionSources(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;
      const search = req.query.search as string | undefined;

      const result = await this.adminService.getAllQuestionSources(page, limit, search);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  async createQuestionSource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const questionSource = await this.adminService.createQuestionSource(req.body.name, createdById);

      // Return canonical format - source object directly at root level
      this.responseUtils.sendSuccessResponse(res, {
        id: questionSource.id,
        name: questionSource.name,
        createdAt: questionSource.createdAt
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  async getQuestionSourceById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const questionSource = await this.adminService.getQuestionSourceById(id);

      // Service already returns canonical format
      this.responseUtils.sendSuccessResponse(res, questionSource);
    } catch (error) {
      next(error);
    }
  }

  async updateQuestionSource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;
      const questionSource = await this.adminService.updateQuestionSource(id, req.body.name, updatedById);

      // Return canonical format - source object directly at root level
      this.responseUtils.sendSuccessResponse(res, {
        id: questionSource.id,
        name: questionSource.name,
        createdAt: questionSource.createdAt,
        updatedAt: questionSource.updatedAt
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteQuestionSource(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const deletedById = req.user!.user_data.id;
      await this.adminService.deleteQuestionSource(id, deletedById);

      this.responseUtils.sendSuccessResponse(res, {
        message: "Question source deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // ACTIVATION CODE MANAGEMENT (Canonical spec)
  // ==========================================

  /**
   * POST /admin/activation-codes
   * Create a new activation code
   * Supports: auto-generated code, multiple study packs, both duration types
   */
  async createActivationCode(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        code,
        description,
        studyPackId,
        studyPackIds,
        expiryDate,
        expiresAt,
        maxUses,
        durationType,
        durationMonths,
        durationDays,
        isActive
      } = req.body;
      const createdById = req.user!.user_data.id;

      const activationCode = await this.activationCodeService.createActivationCode({
        code,
        description,
        studyPackId,
        studyPackIds,
        expiryDate,
        expiresAt,
        maxUses,
        durationType,
        durationMonths,
        durationDays,
        isActive
      }, createdById);

      // Canonical: Return created object directly with 201 status
      res.status(201).json(activationCode);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/activation-codes
   * Get all activation codes with filtering and pagination
   */
  async getAllActivationCodes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, isActive, search, studyPackId, expiryDate } = req.query;

      const filters = {
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        search: search as string | undefined,
        studyPackId: studyPackId ? parseInt(studyPackId as string) : undefined,
        expiryDate: expiryDate as string | undefined
      };

      const result = await this.activationCodeService.getAllActivationCodes(
        filters,
        parseInt(page as string) || 1,
        parseInt(limit as string) || 10
      );

      // Canonical: Return { items, total, page, limit, totalPages }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/activation-codes/:id
   * Get activation code by ID with usage history
   */
  async getActivationCodeById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
        return;
      }

      const activationCode = await this.activationCodeService.getActivationCodeById(id);

      // Canonical: Return activation code object directly
      res.status(200).json(activationCode);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/activation-codes/:id
   * Update activation code
   */
  async updateActivationCode(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
        return;
      }

      const {
        code,
        description,
        studyPackId,
        studyPackIds,
        expiryDate,
        expiresAt,
        maxUses,
        durationType,
        durationMonths,
        durationDays,
        isActive
      } = req.body;

      const activationCode = await this.activationCodeService.updateActivationCode(id, {
        code,
        description,
        studyPackId,
        studyPackIds,
        expiryDate,
        expiresAt,
        maxUses,
        durationType,
        durationMonths,
        durationDays,
        isActive
      });

      // Canonical: Return updated activation code with updatedAt
      res.status(200).json(activationCode);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/activation-codes/:id
   * Delete activation code
   */
  async deleteActivationCode(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
        return;
      }

      const result = await this.activationCodeService.deleteActivationCode(id);

      // Canonical: Return { message }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/activation-codes/:id/deactivate
   * Deactivate activation code
   */
  async deactivateActivationCode(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
        return;
      }

      const result = await this.activationCodeService.deactivateActivationCode(id);

      // Canonical: Return { id, code, isActive, deactivatedAt }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // RESIDENCY QUESTION MANAGEMENT (Canonical spec)
  // ==========================================

  /**
   * GET /admin/residency-questions
   * List residency questions with pagination and filters
   */
  async getResidencyQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        // Accepts the canonical part or an older UI label
        part: normalizeResidencyPart(req.query.part) as string | undefined,
        examYear: req.query.examYear ? parseInt(req.query.examYear as string) : undefined,
        universityId: req.query.universityId ? parseInt(req.query.universityId as string) : undefined,
        search: req.query.search as string | undefined
      };

      const result = await this.adminService.getResidencyQuestions(filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/residency-questions/:id
   * Get single residency question with answers and images
   */
  async getResidencyQuestionById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const result = await this.adminService.getResidencyQuestionById(questionId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/residency-questions
   * Create a new residency question
   */
  async createResidencyQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const result = await this.adminService.createResidencyQuestion(req.body, createdById);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/residency-questions/:id
   * Update a residency question
   */
  async updateResidencyQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const result = await this.adminService.updateResidencyQuestion(questionId, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/residency-questions/:id
   * Delete a residency question
   */
  async deleteResidencyQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      await this.adminService.deleteResidencyQuestion(questionId);
      res.status(200).json({ message: "Residency question deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/residency-questions/bulk
   * Bulk create residency questions
   */
  async bulkCreateResidencyQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const result = await this.adminService.bulkCreateResidencyQuestions(req.body, createdById);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // MODULE BOOKS MANAGEMENT
  // ==========================================

  /**
   * GET /admin/modules/:id/books
   * Get all books for a module
   * Returns: { books: [...] }
   */
  async getModuleBooks(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
        return;
      }

      const result = await this.adminService.getModuleBooks(moduleId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/modules/:id/books
   * Bulk create books for a module
   * Returns: { books: [...], totalCreated, message }
   */
  async createModuleBooks(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
        return;
      }

      const createdById = req.user!.user_data.id;
      const { books } = req.body;

      if (!Array.isArray(books) || books.length === 0) {
        this.responseUtils.sendBadRequestResponse(res, "Books array is required and cannot be empty");
        return;
      }

      const result = await this.adminService.createModuleBooks(moduleId, books, createdById);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/sub-modules/:id/books
   * Bulk create books for a sub-module
   * Returns: { books: [...], totalCreated, message }
   */
  async createSubModuleBooks(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const subModuleId = parseInt(req.params.id);
      if (isNaN(subModuleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid sub-module ID is required");
        return;
      }

      const createdById = req.user!.user_data.id;
      const { books } = req.body;

      if (!Array.isArray(books) || books.length === 0) {
        this.responseUtils.sendBadRequestResponse(res, "Books array is required and cannot be empty");
        return;
      }

      const result = await this.adminService.createSubModuleBooks(subModuleId, books, createdById);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}