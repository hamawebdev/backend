import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import QuizService from "./quiz.service";
import ResponseUtils from "../../core/utils/response.utils";
import { RequestWithUser } from "../../types/types";
import { SessionType, YearLevel } from "@prisma/client";
import { sanitizeString, sanitizeId } from "../../middleware/validation.middleware";

@injectable()
export default class QuizController {
  constructor(
    @inject(QuizService) private quizService: QuizService,
    @inject(ResponseUtils) private responseUtils: ResponseUtils
  ) { }

  // POST /api/v1/quizzes/quiz-sessions
  async createQuizSession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // Body is already validated by middleware, just sanitize
      const sanitizedData = {
        ...req.body,
        title: sanitizeString(req.body.title)
      };

      const result = await this.quizService.createQuizSession(
        sanitizedData,
        req.user!
      );

      this.responseUtils.sendSuccessResponse(res, result.data, 201);
    } catch (error) {
      console.error("Error creating quiz session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/quiz-filters
  async getQuizFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.getQuizFilters(req.user!);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting quiz filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/session-filters - Canonical spec
  // Returns universities, questionSources, examYears, rotations, unites with questionCount
  // Optional query params: uniteId, moduleId for filtering by selection
  async getSessionFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;

      const result = await this.quizService.getSessionFilters(req.user!, { uniteId, moduleId });
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting session filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/session-residency-filters
  async getResidencySessionFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.getResidencySessionFilters(req.user!);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting residency session filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/exam-session-filters
  async getExamSessionFilters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.getExamSessionFilters(req.user!);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting exam session filters:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quiz-sessions/practice/:labelId
  async createPracticeSessionByLabel(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const labelId = parseInt(req.params.labelId);

      if (!labelId || isNaN(labelId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
        return;
      }

      const result = await this.quizService.createPracticeSessionByLabel(req.user!, labelId);
      this.responseUtils.sendSuccessResponse(res, result.data, 201);
    } catch (error) {
      console.error("Error creating practice session by label:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quizzes/create-session-by-questions
  async createSessionByQuestions(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // Sanitize the title field
      const sanitizedData = {
        ...req.body,
        title: sanitizeString(req.body.title)
      };

      const result = await this.quizService.createSessionByQuestions(req.user!, sanitizedData);
      this.responseUtils.sendSuccessResponse(res, result.data, 201);
    } catch (error) {
      console.error("Error creating session by questions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/question-count (legacy)
  async getQuestionCount(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.getQuestionCount(req.user!, req.query);
      this.responseUtils.sendSuccessResponse(res, result.data);
    } catch (error) {
      console.error("Error getting question count:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quizzes/question-count - Canonical spec
  // Returns totalQuestionCount and accessibleQuestionCount
  async getQuestionCountPost(req: RequestWithUser, res: Response): Promise<void> {
    try {
      console.log("[DEBUG] question-count POST body:", JSON.stringify(req.body));
      console.log("[DEBUG] user study packs:", req.user?.accessible_study_packs);
      const result = await this.quizService.getQuestionCountCanonical(req.user!, req.body);
      console.log("[DEBUG] question-count result:", JSON.stringify(result));
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting question count:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quizzes/questions-by-unite-or-module - Canonical spec
  async getQuestionsByUniteOrModule(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const uniteId = req.query.uniteId ? parseInt(req.query.uniteId as string) : undefined;
      const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;

      // Validation: either uniteId OR moduleId must be provided, not both or neither
      if ((uniteId && moduleId) || (!uniteId && !moduleId)) {
        this.responseUtils.sendBadRequestResponse(res, "Either uniteId OR moduleId must be provided, not both");
        return;
      }

      const result = await this.quizService.getQuestionsByUniteOrModule(req.user!, uniteId, moduleId);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting questions by unite/module:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quizzes/sessions - Canonical spec
  // Creates a quiz session and returns { sessionId }
  async createQuizSessionCanonical(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sanitizedData = {
        ...req.body,
        title: sanitizeString(req.body.title)
      };

      const result = await this.quizService.createQuizSessionCanonical(
        sanitizedData,
        req.user!
      );

      this.responseUtils.sendSuccessResponse(res, result, 201);
    } catch (error) {
      console.error("Error creating quiz session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quiz-sessions/:sessionId
  async getQuizSession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);

      if (!sessionId || isNaN(sessionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
        return;
      }

      const result = await this.quizService.getQuizSession(sessionId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting quiz session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quiz-sessions/:sessionId/results
  // Returns computed session results with statistics
  async getSessionResults(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);

      if (!sessionId || isNaN(sessionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
        return;
      }

      const result = await this.quizService.getSessionResults(sessionId, req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting session results:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quiz-sessions/:sessionId/submit-answer
  async submitAnswers(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);

      if (!sessionId || isNaN(sessionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
        return;
      }

      // Convert answer IDs to numbers and handle both single and multiple choice
      const sanitizedData = {
        answers: req.body.answers.map((answer: any) => {
          const sanitized: any = {
            questionId: parseInt(answer.questionId)
          };

          // Handle single choice questions
          if (answer.selectedAnswerId !== undefined) {
            sanitized.selectedAnswerId = parseInt(answer.selectedAnswerId);
          }

          // Handle multiple choice questions
          if (answer.selectedAnswerIds !== undefined && Array.isArray(answer.selectedAnswerIds)) {
            sanitized.selectedAnswerIds = answer.selectedAnswerIds.map((id: any) => parseInt(id));
          }

          return sanitized;
        })
      };

      // Sanitize QROC answers (textAnswer and isCorrect)
      sanitizedData.answers = req.body.answers.map((answer: any) => {
        const sanitized: any = {
          questionId: parseInt(answer.questionId)
        };

        // Handle single choice
        if (answer.selectedAnswerId !== undefined) {
          sanitized.selectedAnswerId = parseInt(answer.selectedAnswerId);
        }

        // Handle multiple choice
        if (answer.selectedAnswerIds !== undefined && Array.isArray(answer.selectedAnswerIds)) {
          sanitized.selectedAnswerIds = answer.selectedAnswerIds.map((id: any) => parseInt(id));
        }

        // Handle QROC
        if (answer.textAnswer !== undefined) {
          sanitized.textAnswer = sanitizeString(answer.textAnswer);
          if (answer.isCorrect !== undefined) {
            sanitized.isCorrect = Boolean(answer.isCorrect);
          }
        }

        return sanitized;
      });

      const result = await this.quizService.submitAnswers(
        sessionId,
        sanitizedData,
        req.user!
      );

      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error submitting answers:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quiz-sessions
  async getUserQuizSessions(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // Use validated pagination parameters from middleware
      const page = (req.query as any).page as number;
      const limit = (req.query as any).limit as number;

      // Validation is now handled by middleware, so we can remove manual validation

      const result = await this.quizService.getUserQuizSessions(req.user!, page, limit);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting user quiz sessions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // GET /api/v1/quiz-sessions/type/:sessionType - Canonical spec
  // Returns flat array (no pagination)
  async getQuizSessionsByType(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionType = req.params.sessionType as string;

      // Validate sessionType
      if (!sessionType || !['PRACTICE', 'EXAM', 'REMEDIAL'].includes(sessionType)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session type is required (PRACTICE, EXAM, REMEDIAL)");
        return;
      }

      const result = await this.quizService.getQuizSessionsByTypeCanonical(
        req.user!,
        sessionType as SessionType
      );

      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting quiz sessions by type:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PUT /api/v1/quiz-sessions/:sessionId/questions/:questionId/answer
  async updateQuizAnswer(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const questionId = parseInt(req.params.questionId);
      const selectedAnswerId = parseInt(req.body.selectedAnswerId);

      if (!sessionId || isNaN(sessionId) || !questionId || isNaN(questionId) || !selectedAnswerId || isNaN(selectedAnswerId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID, question ID, and answer ID are required");
        return;
      }

      const result = await this.quizService.updateQuizAnswer(
        sessionId,
        questionId,
        selectedAnswerId,
        req.user!
      );

      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error updating quiz answer:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // POST /api/v1/quiz-sessions/retake
  async createRetakeSession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.createRetakeSession(
        req.body,
        req.user!
      );

      this.responseUtils.sendSuccessResponse(res, result, 201);
    } catch (error) {
      console.error("Error creating retake session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // DELETE /api/v1/students/quiz-sessions/:sessionId
  async deleteQuizSession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);
      if (!sessionId || isNaN(sessionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
        return;
      }

      const result = await this.quizService.deleteQuizSession(sessionId, req.user!);
      // 200 OK with success message (following existing patterns)
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error deleting quiz session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // PATCH /api/v1/sessions/:sessionId/status - Canonical spec
  async updateSessionStatus(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);
      if (!sessionId || isNaN(sessionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
        return;
      }

      const result = await this.quizService.updateSessionStatus(
        sessionId,
        req.body,
        req.user!
      );

      // Canonical spec format: { message, sessionId, status }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error updating session status:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  // ==========================================
  // RESIDENCY SESSION ENDPOINTS (Canonical spec)
  // ==========================================

  /**
   * GET /quizzes/residency-sessions-only - Canonical spec
   * Returns array of residency sessions for the logged-in user
   */
  async getResidencySessionsOnly(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const result = await this.quizService.getResidencySessionsOnlyCanonical(req.user!);
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      console.error("Error getting residency sessions:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

  /**
   * POST /quizzes/residency-sessions - Canonical spec
   * Creates a residency session. Body: {title, examYear, universityId, parts?}
   * Returns 201: {sessionId, questionCount, title}
   */
  async createResidencySession(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { title, examYear, universityId, parts } = req.body;

      // Validate required fields
      if (!title || typeof title !== 'string') {
        this.responseUtils.sendBadRequestResponse(res, "title is required and must be a string");
        return;
      }
      if (!examYear || typeof examYear !== 'number') {
        this.responseUtils.sendBadRequestResponse(res, "examYear is required and must be a number");
        return;
      }
      if (!universityId || typeof universityId !== 'number') {
        this.responseUtils.sendBadRequestResponse(res, "universityId is required and must be a number");
        return;
      }

      // Validate parts if provided
      if (parts && !Array.isArray(parts)) {
        this.responseUtils.sendBadRequestResponse(res, "parts must be an array");
        return;
      }
      const validParts = ["Sciences_fondamentales", "Pathologie_medico_chirurgical", "Dossier_clinique"];
      if (parts && parts.some((p: string) => !validParts.includes(p))) {
        this.responseUtils.sendBadRequestResponse(res, `parts must contain only ${validParts.join(', ')}`);
        return;
      }

      const result = await this.quizService.createResidencySessionCanonical(
        req.user!,
        { title, examYear, universityId, parts }
      );

      this.responseUtils.sendSuccessResponse(res, result, 201);
    } catch (error) {
      console.error("Error creating residency session:", error);
      this.responseUtils.sendErrorResponse(res, error);
    }
  }

}