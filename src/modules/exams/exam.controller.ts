import { Response } from "express";
import { inject, injectable } from "tsyringe";
import ExamService from "./exam.service";
import ResponseUtils from "../../core/utils/response.utils";
import { RequestWithUser } from "../../types/types";

@injectable()
export default class ExamController {
  constructor(
    @inject(ExamService) private examService: ExamService,
    @inject(ResponseUtils) private responseUtils: ResponseUtils
  ) {}

  // POST /api/v1/exams/exam-sessions
  async createExamSession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const examId = parseInt(req.body.examId);
      
      if (!examId || isNaN(examId)) {
        this.responseUtils.sendBadRequestResponse(res, "Invalid exam ID format");
        return;
      }

      const result = await this.examService.createExamSession(examId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error creating exam session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/exams/available
  async getAvailableExams(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const year = req.query.year as string | undefined;
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;

      const result = await this.examService.getAvailableExams(year, req.user!, moduleId);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting available exams:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/exams/:examId
  async getExamDetails(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const examId = parseInt(req.params.examId);
      
      if (!examId || isNaN(examId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid exam ID is required");
        return;
      }

      const result = await this.examService.getExamDetails(examId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting exam details:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/exams/:examId/questions
  async getExamQuestions(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const examId = parseInt(req.params.examId);

      if (!examId || isNaN(examId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid exam ID is required");
        return;
      }

      const result = await this.examService.getExamQuestions(examId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting exam questions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/exams/by-module/:moduleId/:year
  async getExamsByModuleAndYear(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const moduleId = parseInt(req.params.moduleId);
      const year = parseInt(req.params.year);

      if (!moduleId || isNaN(moduleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
        return;
      }

      if (!year || isNaN(year)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid year is required");
        return;
      }

      const result = await this.examService.getExamsByModuleAndYear(moduleId, year, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting exams by module and year:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/exams/exam-sessions/from-modules
  async createExamSessionFromModules(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { moduleIds, year } = req.body;

      if (!moduleIds || !Array.isArray(moduleIds) || moduleIds.length === 0) {
        this.responseUtils.sendBadRequestResponse(res, "Module IDs array is required");
        return;
      }

      if (!year || isNaN(year)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid year is required");
        return;
      }

      const result = await this.examService.createExamSessionFromModules(moduleIds, year, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error creating exam session from modules:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }
}