import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import QuestionService from "./question.service";
import { RequestWithUser } from "../../types/types";
import ResponseUtils from "../../core/utils/response.utils";
import {
  CreateQuestionDto,
  BulkCreateQuestionsDto,
  UpdateQuestionExplanationDto,
  AddQuestionExplanationImagesDto,
  UpdateQuestionExplanationImageDto
} from "../../types/quiz.types";

@injectable()
export default class QuestionController {
  constructor(
    @inject(QuestionService) private questionService: QuestionService,
    @inject(ResponseUtils) private responseUtils: ResponseUtils
  ) {}

  /**
   * Create a single question
   * POST /api/v1/admin/questions
   */
  async createQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const questionData: CreateQuestionDto = req.body;

      const result = await this.questionService.createQuestion(questionData, createdById);
      
      this.responseUtils.sendSuccessResponse(res, result.data, 201, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create multiple questions with shared metadata
   * POST /api/v1/admin/questions/bulk
   */
  async createQuestionsInBulk(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user!.user_data.id;
      const bulkData: BulkCreateQuestionsDto = req.body;

      const result = await this.questionService.createQuestionsInBulk(bulkData, createdById);
      
      this.responseUtils.sendSuccessResponse(res, result.data, 201, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update question explanation with comprehensive image management
   * PUT /api/v1/admin/questions/:id/explanation
   */
  async updateQuestionExplanation(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;
      const explanationData: UpdateQuestionExplanationDto = req.body;

      // Validate question ID
      if (isNaN(questionId) || questionId <= 0) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      // Validate explanation data
      if (!explanationData.explanation || explanationData.explanation.trim().length === 0) {
        this.responseUtils.sendBadRequestResponse(res, "Explanation text is required");
        return;
      }

      // Additional validation for explanation images
      if (explanationData.explanationImages) {
        if (explanationData.explanationImages.length > 10) {
          this.responseUtils.sendBadRequestResponse(res, "Maximum 10 explanation images allowed");
          return;
        }

        // Validate each image
        for (const img of explanationData.explanationImages) {
          if (!img.imagePath || img.imagePath.trim().length === 0) {
            this.responseUtils.sendBadRequestResponse(res, "Image path is required for all images");
            return;
          }

          if (img.altText && img.altText.length > 255) {
            this.responseUtils.sendBadRequestResponse(res, "Alt text must be 255 characters or less");
            return;
          }
        }
      }

      const result = await this.questionService.updateQuestionExplanation(
        questionId,
        explanationData,
        updatedById
      );

      this.responseUtils.sendSuccessResponse(res, result.data, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an existing question
   * PUT /api/v1/admin/questions/:id
   */
  async updateQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const updatedById = req.user!.user_data.id;

      if (isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const result = await this.questionService.updateQuestion(questionId, req.body, updatedById);
      this.responseUtils.sendSuccessResponse(res, result.data, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a question
   * DELETE /api/v1/admin/questions/:id
   */
  async deleteQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const deletedById = req.user!.user_data.id;

      if (isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const result = await this.questionService.deleteQuestion(questionId, deletedById);
      // Service returns canonical format { message: "..." }
      this.responseUtils.sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available filters for question selection
   * GET /api/v1/admin/questions/filters
   */
  async getQuestionFilters(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const filters = await this.questionService.getAvailableFilters(user.accessible_study_packs);

      this.responseUtils.sendSuccessResponse(res, { filters });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single question by ID with images
   * GET /api/v1/admin/questions/:id
   * Returns canonical format with answers, images arrays at root level
   */
  async getQuestionById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      if (isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const question = await this.questionService.getQuestionById(questionId);

      // Transform to canonical format
      const response = {
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        courseId: question.courseId,
        course: question.course ? {
          id: question.course.id,
          name: question.course.name
        } : null,
        answers: question.questionAnswers.map((a: any) => ({
          id: a.id,
          answerText: a.answerText,
          isCorrect: a.isCorrect
        })),
        explanation: question.explanation,
        images: question.questionImages.map((img: any) => ({
          id: img.id,
          imagePath: img.imagePath,
          altText: img.altText
        })),
        universityId: question.universityId,
        yearLevel: question.yearLevel,
        examYear: question.examYear,
        sourceId: question.sourceId,
        createdAt: question.createdAt
      };

      this.responseUtils.sendSuccessResponse(res, response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Attach images to an existing question
   * POST /api/v1/admin/questions/:id/images
   */
  async addQuestionImages(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      if (isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const images = (req.body?.images || []) as { imagePath: string; altText?: string }[];
      const updated = await this.questionService.addQuestionImages(questionId, images, req.user!.user_data.id);
      this.responseUtils.sendSuccessResponse(res, updated, 201, "Images attached to question");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an image from a question
   * PUT /api/v1/admin/questions/:id/images/:imageId
   */
  async updateQuestionImage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const imageId = parseInt(req.params.imageId);
      if (isNaN(questionId) || isNaN(imageId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
        return;
      }

      const { imagePath, altText } = req.body;
      const result = await this.questionService.updateQuestionImage(
        questionId,
        imageId,
        { imagePath, altText },
        req.user!.user_data.id
      );
      this.responseUtils.sendSuccessResponse(res, result, 200, "Question image updated successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove an image from a question
   * DELETE /api/v1/admin/questions/:id/images/:imageId
   */
  async deleteQuestionImage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const imageId = parseInt(req.params.imageId);
      if (isNaN(questionId) || isNaN(imageId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
        return;
      }

      const result = await this.questionService.deleteQuestionImage(questionId, imageId, req.user!.user_data.id);
      this.responseUtils.sendSuccessResponse(res, result, 200, "Image removed from question");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Attach explanation images to an existing question
   * POST /api/v1/admin/questions/:id/explanation-images
   */
  async addQuestionExplanationImages(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      if (isNaN(questionId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
        return;
      }

      const images = (req.body?.images || []) as { imagePath: string; altText?: string }[];

      // Additional validation
      if (!Array.isArray(images) || images.length === 0) {
        this.responseUtils.sendBadRequestResponse(res, "At least one image is required");
        return;
      }

      if (images.length > 10) {
        this.responseUtils.sendBadRequestResponse(res, "Maximum 10 images allowed per request");
        return;
      }

      const updated = await this.questionService.addQuestionExplanationImages(questionId, images, req.user!.user_data.id);
      this.responseUtils.sendSuccessResponse(res, updated, 201, "Explanation images attached to question");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an explanation image from a question
   * PUT /api/v1/admin/questions/:id/explanation-images/:imageId
   */
  async updateQuestionExplanationImage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const imageId = parseInt(req.params.imageId);
      if (isNaN(questionId) || isNaN(imageId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
        return;
      }

      const { imagePath, altText } = req.body;
      const result = await this.questionService.updateQuestionExplanationImage(
        questionId,
        imageId,
        { imagePath, altText },
        req.user!.user_data.id
      );
      this.responseUtils.sendSuccessResponse(res, result, 200, "Question explanation image updated successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove an explanation image from a question
   * DELETE /api/v1/admin/questions/:id/explanation-images/:imageId
   */
  async deleteQuestionExplanationImage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseInt(req.params.id);
      const imageId = parseInt(req.params.imageId);
      if (isNaN(questionId) || isNaN(imageId)) {
        this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
        return;
      }

      const result = await this.questionService.deleteQuestionExplanationImage(questionId, imageId, req.user!.user_data.id);
      this.responseUtils.sendSuccessResponse(res, result, 200, "Explanation image removed from question");
    } catch (error) {
      next(error);
    }
  }
}
