import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import StudentService from "./student.service";
import ResponseUtils from "../../core/utils/response.utils";
import { RequestWithUser } from "../../types/types";
import { SessionType } from "@prisma/client";
import { StudentSessionResultsFilters } from "../../types/quiz.types";
import { CodeRedemptionService } from "./services/code-redemption.service";

// Validation schemas
const updateCourseProgressSchema = z.object({
  layer: z.number().min(1).max(3),
  completed: z.boolean()
});

@injectable()
export default class StudentController {
  constructor(
    @inject(StudentService) private studentService: StudentService,
    @inject(ResponseUtils) private responseUtils: ResponseUtils,
    @inject(CodeRedemptionService) private codeRedemptionService: CodeRedemptionService
  ) { }

  // GET /api/v1/students/progress/overview - Canonical: flat {overallProgress, moduleProgress[]}
  async getProgressOverview(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getProgressOverviewCanonical(req.user!);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting progress overview:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/students/courses/:courseId/progress - Canonical: {courseId, progress, updatedAt}
  async updateCourseProgress(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId);

      if (!courseId || isNaN(courseId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid Course ID is required");
        return;
      }

      // Canonical spec takes progress as percentage
      const { progress } = req.body;
      if (progress === undefined || typeof progress !== 'number' || progress < 0 || progress > 100) {
        this.responseUtils.sendBadRequestResponse(res, "Valid progress value (0-100) is required");
        return;
      }

      const result = await this.studentService.updateCourseProgressCanonical(
        courseId,
        progress,
        req.user!
      );

      res.status(200).json(result);
    } catch (error) {
      console.error("Error updating course progress:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/quiz-history - Canonical: {items, total, page, limit, totalPages}
  async getQuizHistory(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { type, status, page, limit, sortBy, sortOrder } = req.query as any;
      const parsedPage = page ? parseInt(page) : 1;
      const parsedLimit = limit ? parseInt(limit) : 10;

      const result = await this.studentService.getQuizHistoryCanonical(
        req.user!,
        type,
        status,
        parsedPage,
        parsedLimit,
        sortBy,
        sortOrder
      );
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting quiz history:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/course-analytics - Canonical: {items, total, page, limit, totalPages}
  async getCourseAnalytics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { sessionId, sessionType, page, limit } = req.query as any;
      const parsedPage = page ? parseInt(page) : 1;
      const parsedLimit = limit ? parseInt(limit) : 10;
      const parsedSessionId = sessionId ? parseInt(sessionId) : undefined;

      const result = await this.studentService.getCourseAnalyticsCanonical(
        req.user!,
        parsedSessionId,
        sessionType,
        parsedPage,
        parsedLimit
      );
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting course analytics:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/session-results - Canonical: {items, total, page, limit, totalPages}
  async getStudentSessionResults(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { page, limit, sessionType, completedAfter, completedBefore, sessionIds } = req.query as any;
      const parsedPage = page ? parseInt(page as string, 10) : 1;
      const parsedLimit = limit ? parseInt(limit as string, 10) : 10;

      // Parse sessionIds if provided
      let parsedSessionIds: number[] | undefined;
      if (sessionIds) {
        parsedSessionIds = (sessionIds as string)
          .split(',')
          .map((id: string) => parseInt(id.trim(), 10))
          .filter((id: number) => !isNaN(id) && id > 0);
      }

      const filters: any = {
        sessionType,
        completedAfter,
        completedBefore,
        sessionIds: parsedSessionIds
      };

      const result = await this.studentService.getSessionResultsCanonical(
        req.user!,
        filters,
        parsedPage,
        parsedLimit
      );

      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting student session results:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/available-sessions - Canonical: flat array
  async getAvailableSessionsForFiltering(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { sessionType } = req.query as any;

      if (!sessionType) {
        this.responseUtils.sendBadRequestResponse(res, "sessionType query parameter is required");
        return;
      }

      const result = await this.studentService.getAvailableSessionsCanonical(
        req.user!,
        sessionType
      );

      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting available sessions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/analytics
  async getPerformanceAnalytics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getPerformanceAnalytics(req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting performance analytics:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/dashboard
  async getStudentDashboard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getStudentDashboard(req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting student dashboard:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // STUDY CONTENT ACCESS & NAVIGATION
  // ==========================================

  // GET /api/v1/students/content/filters
  async getContentFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const yearLevel = req.query.yearLevel as string | undefined;
      const result = await this.studentService.getContentFilters(req.user!, yearLevel);
      // Canonical spec: { unites: [...], independentModules: [...] }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting content filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/content/independent-resources
  async getIndependentResources(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const yearLevel = req.query.yearLevel as string | undefined;
      const result = await this.studentService.getIndependentResources(req.user!, yearLevel);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting independent resources:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/study-packs
  async getStudyPacks(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const search = req.query.search as string | undefined;
      const result = await this.studentService.getStudyPacks(req.user!, { page, limit, search });
      // Canonical spec: { items, total, page, limit, totalPages }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting study packs:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/study-packs/:id
  async getStudyPackById(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid study pack ID is required");
        return;
      }

      const result = await this.studentService.getStudyPackById(id, req.user!);
      // Canonical spec: study pack with modules (not unites)
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting study pack details:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/student/study-pack/:studyPackId - Student context
  async getStudentStudyPack(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.studyPackId);
      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid study pack ID is required");
        return;
      }

      const result = await this.studentService.getStudentStudyPack(id, req.user!);
      // Canonical spec: study pack in student context with modules
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting student study pack:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/courses/:id/resources
  async getCourseResources(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const type = req.query.type as string | undefined;

      const result = await this.studentService.getCourseResources(id, req.user!, { page, limit, type });
      // Canonical spec: { items, total, page, limit, totalPages }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting course resources:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/courses/by-module
  async getCoursesByModule(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;

      // Validate: either moduleId OR uniteId must be provided, not both
      if ((moduleId && uniteId) || (!moduleId && !uniteId)) {
        this.responseUtils.sendBadRequestResponse(res, "Either moduleId OR uniteId must be provided, not both");
        return;
      }

      const result = await this.studentService.getCoursesByModule(req.user!, { moduleId, uniteId });
      // Canonical spec: { courses: [...] }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting courses by module:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // MODULE BOOKS
  // ==========================================

  // GET /students/modules/:moduleId/books
  async getModuleBooks(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const moduleId = parseInt(req.params.moduleId);

      if (!moduleId || isNaN(moduleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid moduleId is required");
        return;
      }

      const result = await this.studentService.getModuleBooksCanonical(req.user!, moduleId);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting module books:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // SUBSCRIPTION-BASED QUESTION RETRIEVAL
  // ==========================================

  // GET /api/v1/students/questions
  async getQuestionsBasedOnSubscription(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // Validation handled by middleware - query params are already validated and transformed
      const filters = req.query as any;

      const result = await this.studentService.getQuestionsBasedOnSubscription(req.user!, filters);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting subscription-based questions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  // GET /api/v1/students/subscriptions
  // Canonical spec: Returns array of subscriptions
  async getUserSubscriptions(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getUserSubscriptions(req.user!);
      // Canonical spec: returns array directly, not wrapped in { success, data }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting user subscriptions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/subscriptions/check-access
  // Canonical spec: { hasAccess, subscriptionRequired, subscriptionType?, trialAvailable? }
  async checkSubscriptionAccess(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const contentId = req.query.contentId ? parseInt(req.query.contentId as string) : undefined;
      const contentType = req.query.contentType as string | undefined;

      if (!contentId || isNaN(contentId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid contentId is required");
        return;
      }

      if (!contentType || (contentType !== 'study-pack' && contentType !== 'course')) {
        this.responseUtils.sendBadRequestResponse(res, "contentType must be 'study-pack' or 'course'");
        return;
      }

      const result = await this.studentService.checkSubscriptionAccess(req.user!, contentId, contentType);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error checking subscription access:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/subscriptions/:subscriptionId/cancel
  // Canonical spec: { success, message, cancellationDate }
  async cancelSubscription(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const subscriptionId = parseInt(req.params.subscriptionId);
      if (!subscriptionId || isNaN(subscriptionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid subscription ID is required");
        return;
      }

      const result = await this.studentService.cancelSubscription(subscriptionId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // STUDENT NOTES SYSTEM (Canonical API)
  // ==========================================

  // GET /api/v1/students/notes - Canonical: returns flat array with labels
  async getStudentNotes(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const questionId = req.query.questionId ? parseInt(req.query.questionId as string) : undefined;
      const quizId = req.query.quizId ? parseInt(req.query.quizId as string) : undefined;

      // Parse labelIds[] - can be passed as labelIds[]=1&labelIds[]=2 or labelIds=1,2
      let labelIds: number[] | undefined;
      if (req.query['labelIds[]']) {
        const rawLabelIds = req.query['labelIds[]'];
        labelIds = Array.isArray(rawLabelIds)
          ? rawLabelIds.map(id => parseInt(id as string)).filter(id => !isNaN(id))
          : [parseInt(rawLabelIds as string)].filter(id => !isNaN(id));
      } else if (req.query.labelIds) {
        const rawLabelIds = req.query.labelIds;
        if (Array.isArray(rawLabelIds)) {
          labelIds = rawLabelIds.map(id => parseInt(id as string)).filter(id => !isNaN(id));
        } else if (typeof rawLabelIds === 'string') {
          labelIds = rawLabelIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
      }

      const result = await this.studentService.getStudentNotesCanonical(req.user!, { search, questionId, quizId, labelIds });
      // Canonical spec: returns array directly
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting student notes:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/notes/by-module - Canonical: returns grouped notes
  async getNotesByModule(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;

      // Validation: exactly one of moduleId or uniteId must be provided
      if ((!moduleId && !uniteId) || (moduleId && uniteId)) {
        this.responseUtils.sendBadRequestResponse(res, "Exactly one of moduleId or uniteId must be provided");
        return;
      }

      const result = await this.studentService.getNotesByModuleCanonical(req.user!, moduleId, uniteId);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting notes by module:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/students/notes - Canonical: returns note object with 201 status
  async createStudentNote(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const noteSchema = z.object({
        noteText: z.string().min(1, "Note text is required").max(5000, "Note text must be at most 5000 characters"),
        questionId: z.number().int().positive().optional(),
        quizId: z.number().int().positive().optional(),
        labelIds: z.array(z.number().int().positive()).optional()
      });

      const validation = noteSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { noteText, questionId, quizId, labelIds } = validation.data;

      // Canonical spec: at least one of questionId or quizId must be provided
      if (!questionId && !quizId) {
        this.responseUtils.sendBadRequestResponse(res, "At least one of questionId or quizId must be provided");
        return;
      }

      const result = await this.studentService.createStudentNoteCanonical(req.user!, noteText, questionId, quizId, labelIds);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating student note:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/students/notes/:noteId - Canonical: returns note object with labels
  async updateStudentNote(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const noteId = parseInt(req.params.noteId || req.params.id);
      const noteSchema = z.object({
        noteText: z.string().min(1).max(5000).optional(),
        labelIds: z.array(z.number().int().positive()).optional()
      });

      if (!noteId || isNaN(noteId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid note ID is required");
        return;
      }

      const validation = noteSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { noteText, labelIds } = validation.data;
      const result = await this.studentService.updateStudentNoteCanonical(noteId, req.user!, noteText, labelIds);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error updating student note:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // DELETE /api/v1/students/notes/:noteId - Canonical: returns { message }
  async deleteStudentNote(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const noteId = parseInt(req.params.noteId || req.params.id);
      if (!noteId || isNaN(noteId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid note ID is required");
        return;
      }

      await this.studentService.deleteStudentNoteCanonical(noteId, req.user!);
      res.status(200).json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting student note:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/questions/:questionId/notes - Canonical: returns array with labels
  async getQuestionNotes(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const questionId = parseInt(req.params.questionId || req.params.id);
      if (!questionId || isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const result = await this.studentService.getQuestionNotesCanonical(questionId, req.user!);
      // Canonical spec: returns array directly
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting question notes:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // LABELING SYSTEM (Canonical API)
  // ==========================================

  // GET /api/v1/students/labels - Canonical: returns { data: [...] }
  async getStudentLabels(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getStudentLabelsCanonical(req.user!);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting student labels:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/labels/:labelId - Canonical: returns object directly
  async getStudentLabelById(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const labelId = parseInt(req.params.labelId || req.params.id);

      if (!labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
        return;
      }

      const result = await this.studentService.getStudentLabelByIdCanonical(labelId, req.user!);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting student label by ID:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Label not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/students/labels - Canonical: returns object with 201 status
  async createStudentLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const labelSchema = z.object({
        name: z.string().min(1, "Label name is required").max(50, "Label name too long")
      });

      const validation = labelSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { name } = validation.data;
      const result = await this.studentService.createStudentLabelCanonical(req.user!, name);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating student label:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/students/labels/:labelId - Canonical: returns object with statistics
  async updateStudentLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const labelId = parseInt(req.params.labelId || req.params.id);
      const labelSchema = z.object({
        name: z.string().min(1, "Label name is required").max(50, "Label name too long")
      });

      if (!labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
        return;
      }

      const validation = labelSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { name } = validation.data;
      const result = await this.studentService.updateStudentLabelCanonical(labelId, req.user!, name);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error updating student label:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Label not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // DELETE /api/v1/students/labels/:labelId - Canonical: returns { message }
  async deleteStudentLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const labelId = parseInt(req.params.labelId || req.params.id);
      if (!labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
        return;
      }

      await this.studentService.deleteStudentLabel(labelId, req.user!);
      res.status(200).json({ message: 'Label deleted successfully' });
    } catch (error: any) {
      console.error("Error deleting student label:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Label not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/labels/by-module - Canonical: returns { labels: [...] }
  async getLabelsByModule(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;

      // Validate mutually exclusive params
      if ((moduleId && uniteId) || (!moduleId && !uniteId)) {
        res.status(400).json({ message: 'Either moduleId or uniteId must be provided (not both)' });
        return;
      }

      const result = await this.studentService.getLabelsByModuleCanonical(req.user!, moduleId, uniteId);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting labels by module:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: error.message });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/students/quizzes/:quizId/labels/:labelId
  async addQuizToLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const quizId = parseInt(req.params.quizId);
      const labelId = parseInt(req.params.labelId);

      if (!quizId || isNaN(quizId) || !labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid Quiz ID and Label ID are required");
        return;
      }

      const result = await this.studentService.addQuizToLabel(req.user!.user_data.id, quizId, labelId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error adding quiz to label:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }



  // POST /api/v1/students/questions/:questionId/labels/:labelId - Canonical: returns { message }
  async addQuestionToLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const questionId = parseInt(req.params.questionId);
      const labelId = parseInt(req.params.labelId);

      if (!questionId || isNaN(questionId) || !labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid Question ID and Label ID are required");
        return;
      }

      await this.studentService.addQuestionToLabelCanonical(req.user!, questionId, labelId);
      res.status(200).json({ message: 'Question added to label successfully' });
    } catch (error: any) {
      console.error("Error adding question to label:", error);
      if (error.message?.includes('already')) {
        res.status(400).json({ message: 'Question already in label' });
        return;
      }
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: error.message });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // DELETE /api/v1/students/questions/:questionId/labels/:labelId - Canonical: returns { message }
  async removeQuestionFromLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const questionId = parseInt(req.params.questionId);
      const labelId = parseInt(req.params.labelId);

      if (!questionId || isNaN(questionId) || !labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid Question ID and Label ID are required");
        return;
      }

      await this.studentService.removeQuestionFromLabelCanonical(req.user!, questionId, labelId);
      res.status(200).json({ message: 'Question removed from label successfully' });
    } catch (error: any) {
      console.error("Error removing question from label:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: error.message });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // TODO & TASK MANAGEMENT
  // ==========================================

  // GET /api/v1/students/todos
  async getTodos(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const priority = req.query.priority as string | undefined;
      const includeCompleted = req.query.includeCompleted === 'true';
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      const result = await this.studentService.getTodos(req.user!, status, type, priority, page, limit, includeCompleted);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting todos:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/students/todos
  async createTodo(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const todoSchema = z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        type: z.enum(["READING", "QUIZ", "SESSION", "EXAM", "OTHER"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
        dueDate: z.string().datetime().optional(),
        courseId: z.number().int().positive().optional(),
        quizId: z.number().int().positive().optional()
      });

      const validation = todoSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }
      const { title, description, type, priority, dueDate, courseId, quizId } = validation.data;
      const result = await this.studentService.createTodo(
        req.user!,
        title,
        description,
        type,
        priority,
        dueDate ? new Date(dueDate) : undefined,
        courseId, // Already a number or undefined
        quizId    // Already a number or undefined
      );
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error creating todo:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/students/todos/:id
  async updateTodo(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const todoSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
        dueDate: z.string().datetime().optional(),
        status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional()
      });

      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
        return;
      }

      const validation = todoSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const updateData: any = validation.data;
      if (updateData.dueDate) {
        updateData.dueDate = new Date(updateData.dueDate);
      }

      const result = await this.studentService.updateTodo(id, req.user!, updateData);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error updating todo:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // DELETE /api/v1/students/todos/:id
  async deleteTodo(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
        return;
      }

      const result = await this.studentService.deleteTodo(id, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error deleting todo:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/students/todos/:id/complete
  async completeTodo(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
        return;
      }

      const result = await this.studentService.completeTodo(id, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error completing todo:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // QUESTION REPORTING SYSTEM
  // ==========================================

  // POST /api/v1/students/questions/:questionId/report - Canonical spec
  async createQuestionReport(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const questionId = parseInt(req.params.questionId);
      const reportSchema = z.object({
        reportType: z.enum(["INCORRECT_ANSWER", "TYPO", "UNCLEAR_QUESTION", "MISSING_INFO", "OTHER"]),
        description: z.string().optional()
      });

      if (!questionId || isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const validation = reportSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { reportType, description } = validation.data;
      const report = await this.studentService.createQuestionReportCanonical(req.user!, questionId, reportType, description);
      res.status(201).json(report);
    } catch (error: any) {
      console.error("Error creating question report:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: 'Question not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/reports
  async getUserReports(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getUserReports(req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting user reports:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/reports/:reportId - Canonical spec
  async getReportById(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const reportId = parseInt(req.params.reportId);
      if (!reportId || isNaN(reportId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid report ID is required");
        return;
      }

      const report = await this.studentService.getReportById(reportId, req.user!);
      res.status(200).json(report);
    } catch (error: any) {
      console.error("Error getting report details:", error);
      if (error.message === 'Report not found') {
        res.status(404).json({ message: 'Report not found' });
        return;
      }
      if (error.message === 'Not owner of report') {
        res.status(403).json({ message: 'Not owner of report' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // ENHANCED DASHBOARD FEATURES
  // ==========================================

  // GET /api/v1/students/dashboard/performance - Canonical: flat object
  async getDetailedPerformanceAnalytics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getDashboardPerformanceCanonical(req.user!);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting detailed performance analytics:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/dashboard/stats - Canonical: flat object with stats
  async getDashboardStats(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getDashboardStatsCanonical(req.user!);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/analytics/time-based - Canonical: {period, data[]}
  async getTimeBasedAnalytics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { period, startDate, endDate } = req.query as any;

      if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
        this.responseUtils.sendBadRequestResponse(res, "period query parameter is required (daily, weekly, or monthly)");
        return;
      }

      const result = await this.studentService.getTimeBasedAnalyticsCanonical(
        req.user!,
        period,
        startDate,
        endDate
      );
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting time-based analytics:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/courses/:courseId/progress - Canonical: {courseId, courseName, progress, lastAccessedAt}
  async getCourseProgress(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId);
      if (!courseId || isNaN(courseId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid Course ID is required");
        return;
      }

      const result = await this.studentService.getCourseProgressCanonical(courseId, req.user!);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting course progress:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/students/session-stats
  async getSessionStatistics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getSessionStatistics(req.user!);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting session statistics:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // ACTIVATION CODE VALIDATION
  // ==========================================

  // POST /api/v1/students/codes/validate
  async validateActivationCode(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        this.responseUtils.sendBadRequestResponse(res, "Activation code is required");
        return;
      }

      const result = await this.codeRedemptionService.validateActivationCode(code);

      if (result.isValid) {
        this.responseUtils.sendSuccessResponse(res, {
          message: result.message,
          isValid: true,
          code: result.code,
          studyPacks: result.studyPacks
        });
      } else {
        this.responseUtils.sendBadRequestResponse(res, result.message || "Invalid activation code");
      }
    } catch (error) {
      console.error("Error validating activation code:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/students/codes/redeem
  // Canonical spec: { message, subscription: {...} }
  async redeemActivationCode(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { code } = req.body;
      const userId = req.user!.user_data.id;

      if (!code || typeof code !== 'string') {
        this.responseUtils.sendBadRequestResponse(res, "Activation code is required");
        return;
      }

      const result = await this.codeRedemptionService.redeemActivationCode(code, userId);

      // Format for canonical spec: { message, subscription }
      const canonicalResponse = {
        message: result.message,
        subscription: result.data?.subscriptions?.[0] ? {
          id: result.data.subscriptions[0].id,
          studyPackId: result.data.subscriptions[0].studyPackId,
          status: result.data.subscriptions[0].status,
          startDate: result.data.subscriptions[0].startDate,
          endDate: result.data.subscriptions[0].endDate,
          studyPack: result.data.subscriptions[0].studyPack ? {
            id: result.data.subscriptions[0].studyPack.id,
            name: result.data.subscriptions[0].studyPack.name,
            type: result.data.subscriptions[0].studyPack.type,
            yearNumber: result.data.subscriptions[0].studyPack.yearNumber
          } : undefined
        } : null
      };

      this.responseUtils.sendSuccessResponse(res, canonicalResponse, 200);
    } catch (error) {
      console.error("Error redeeming activation code:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // CANONICAL SPEC ENDPOINTS - Practice Sessions
  // ==========================================

  /**
   * GET /students/sessions/filters - Canonical spec
   * Returns filter options for sessions by type (PRACTICE/EXAM)
   */
  async getSessionsFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionType = req.query.sessionType as string;
      const yearLevel = req.query.yearLevel as string | undefined;

      if (!sessionType || !['PRACTICE', 'EXAM'].includes(sessionType)) {
        this.responseUtils.sendBadRequestResponse(res, "sessionType is required and must be PRACTICE or EXAM");
        return;
      }

      const result = await this.studentService.getSessionsFilters(
        req.user!,
        sessionType as 'PRACTICE' | 'EXAM',
        yearLevel
      );

      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting sessions filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/sessions/residency-filters - Canonical spec
   * Returns: { universities: [{id, name, examYears}], parts: ['PART_1', 'PART_2'], totalQuestions }
   */
  async getResidencyFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getResidencyFiltersCanonical(req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting residency filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/practise-sessions - Canonical spec
   * Returns practice sessions with pagination and optional filtering
   */
  async getPractiseSessions(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionType = req.query.sessionType as string;

      if (!sessionType || !['PRACTICE', 'EXAM'].includes(sessionType)) {
        this.responseUtils.sendBadRequestResponse(res, "sessionType is required and must be PRACTICE or EXAM");
        return;
      }

      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      // Validation: moduleId and uniteId are mutually exclusive
      if (moduleId && uniteId) {
        this.responseUtils.sendBadRequestResponse(res, "Cannot specify both moduleId and uniteId");
        return;
      }

      const result = await this.studentService.getPractiseSessions(
        req.user!,
        sessionType as 'PRACTICE' | 'EXAM',
        { moduleId, uniteId, page, limit }
      );

      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting practise sessions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // CANONICAL SPEC ENDPOINTS - Course Layers & Cards
  // ==========================================

  /**
   * POST /students/course-layers - Canonical spec
   * Upsert course layer completion status
   */
  async upsertCourseLayer(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const layerSchema = z.object({
        courseId: z.number().int().positive("courseId must be a positive integer"),
        layerNumber: z.number().int().min(1).max(3, "layerNumber must be between 1 and 3"),
        completed: z.boolean()
      });

      const validation = layerSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { courseId, layerNumber, completed } = validation.data;
      const result = await this.studentService.upsertCourseLayerCanonical(
        req.user!,
        courseId,
        layerNumber,
        completed
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error upserting course layer:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: 'Course not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/courses/:courseId/layers - Canonical spec
   * Get all layer completion statuses for a course
   */
  async getCourseLayersCanonical(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId);

      if (!courseId || isNaN(courseId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const result = await this.studentService.getCourseLayersCanonical(req.user!, courseId);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting course layers:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: 'Course not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * POST /students/cards - Canonical spec
   * Create a study card with optional courses
   */
  async createCard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardSchema = z.object({
        title: z.string().min(1, "Title is required").max(100, "Title too long"),
        description: z.string().max(500, "Description too long").optional(),
        courseIds: z.array(z.number().int().positive()).optional()
      });

      const validation = cardSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const { title, description, courseIds } = validation.data;
      const result = await this.studentService.createCardCanonical(req.user!, title, description, courseIds);

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating card:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/cards - Canonical spec
   * Get all cards for the authenticated user
   */
  async getAllCards(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.studentService.getAllCardsCanonical(req.user!);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting all cards:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/cards/filter-by-unit-module - Canonical spec
   * Get cards filtered by uniteId or moduleId
   */
  async getCardsByUnitModule(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;

      // Validation: exactly one of uniteId or moduleId must be provided
      if ((!uniteId && !moduleId) || (uniteId && moduleId)) {
        res.status(400).json({ message: 'Either uniteId or moduleId must be provided (not both)' });
        return;
      }

      const result = await this.studentService.getCardsByUnitModuleCanonical(req.user!, uniteId, moduleId);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting cards by unit/module:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: error.message });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/cards/:cardId - Canonical spec
   * Get card by ID with full course details
   */
  async getCardById(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      const result = await this.studentService.getCardByIdCanonical(req.user!, cardId);

      if (!result) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting card by ID:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * PUT /students/cards/:cardId - Canonical spec
   * Update card title and/or description
   */
  async updateCard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);
      const cardSchema = z.object({
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional()
      });

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      const validation = cardSchema.safeParse(req.body);
      if (!validation.success) {
        this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
        return;
      }

      const result = await this.studentService.updateCardCanonical(req.user!, cardId, validation.data);

      if (!result) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error updating card:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * DELETE /students/cards/:cardId - Canonical spec
   * Delete a card
   */
  async deleteCard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      const deleted = await this.studentService.deleteCardCanonical(req.user!, cardId);

      if (!deleted) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }

      res.status(200).json({ message: 'Card deleted successfully' });
    } catch (error: any) {
      console.error("Error deleting card:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * POST /students/cards/:cardId/courses/:courseId - Canonical spec
   * Add a course to a card
   */
  async addCourseToCard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);
      const courseId = parseInt(req.params.courseId);

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      if (!courseId || isNaN(courseId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const result = await this.studentService.addCourseToCardCanonical(req.user!, cardId, courseId);

      if (!result.success) {
        if (result.alreadyExists) {
          res.status(400).json({ message: 'Course already in card' });
        } else {
          res.status(404).json({ message: 'Card not found' });
        }
        return;
      }

      res.status(200).json({ message: 'Course added to card successfully' });
    } catch (error: any) {
      console.error("Error adding course to card:", error);
      if (error.message?.includes('not found')) {
        res.status(404).json({ message: error.message });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * DELETE /students/cards/:cardId/courses/:courseId - Canonical spec
   * Remove a course from a card
   */
  async removeCourseFromCard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);
      const courseId = parseInt(req.params.courseId);

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      if (!courseId || isNaN(courseId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
        return;
      }

      const deleted = await this.studentService.removeCourseFromCardCanonical(req.user!, cardId, courseId);

      if (!deleted) {
        res.status(404).json({ message: 'Card, course, or association not found' });
        return;
      }

      res.status(200).json({ message: 'Course removed from card successfully' });
    } catch (error: any) {
      console.error("Error removing course from card:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Card or course not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * GET /students/cards/:cardId/progress - Canonical spec
   * Get progress for all courses in a card based on layer completion
   */
  async getCardProgress(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const cardId = parseInt(req.params.cardId);

      if (!cardId || isNaN(cardId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
        return;
      }

      const result = await this.studentService.getCardProgressCanonical(req.user!, cardId);

      if (!result) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error getting card progress:", error);
      if (error.message?.includes('not found') || error.message?.includes('permission')) {
        res.status(404).json({ message: 'Card not found' });
        return;
      }
      this.responseUtils.sendErrorResponse(res, error);
    }
  }
}