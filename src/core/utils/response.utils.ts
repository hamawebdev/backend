import { inject, singleton, injectable } from "tsyringe";
import { Response } from "express";
import HttpStatusCode from "./HttpStatusCode";
import { AppError } from "../errors/AppError";
import { 
  SessionNotFoundError,
  SessionCompletedError,
  SessionStatusError,
  InsufficientQuestionsError,
  InvalidAnswerError,
  QuestionNotInSessionError,
  SubscriptionRequiredError,
  NoQuestionsFoundError,
  QuizCreationFailedError,
  InvalidQuizConfigurationError,
  RateLimitExceededError
} from "../errors/QuizErrors";

interface SuccessResponse<T> {
  success: true;
  data?: T;
  message?: string;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

interface ErrorResponse {
  success: false;
  error: {
    type: string;
    message: string;
    code?: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    retryAfter?: number;
  };
}

@singleton()
@injectable()
class ResponseUtils {
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Success response with data
  sendSuccessResponse<T>(
    res: Response,
    data: T,
    status = HttpStatusCode.OK,
    requestId?: string
  ): Response<SuccessResponse<T>> {
    return res.status(status).json({ 
      success: true, 
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  // Success response without data (e.g., for delete operations)
  sendSuccessNoDataResponse(
    res: Response,
    message = "Operation successful",
    status = HttpStatusCode.OK,
    requestId?: string
  ): Response<SuccessResponse<null>> {
    return res.status(status).json({ 
      success: true, 
      message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  // Enhanced error response that handles AppError instances
  sendErrorResponse(
    res: Response,
    error: any,
    requestId?: string
  ): Response<ErrorResponse> {
    const timestamp = new Date().toISOString();
    const reqId = requestId || this.generateRequestId();

    // Handle AppError instances
    if (error instanceof AppError) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          type: error.name,
          message: error.message,
          code: error.code,
          timestamp,
          requestId: reqId
        }
      };

      // Add retry-after for rate limit errors
      if (error instanceof RateLimitExceededError) {
        const retryMatch = error.message.match(/(\d+) seconds/);
        if (retryMatch) {
          errorResponse.error.retryAfter = parseInt(retryMatch[1]);
          res.set('Retry-After', retryMatch[1]);
        }
      }

      return res.status(error.statusCode).json(errorResponse);
    }

    // Handle generic errors
    const status = error.statusCode || HttpStatusCode.INTERNAL_SERVER_ERROR;
    const message = error.message || "An unexpected error occurred";
    
    return res.status(status).json({
      success: false,
      error: {
        type: "InternalServerError",
        message,
        timestamp,
        requestId: reqId
      }
    });
  }

  // Validation Error response with detailed field errors
  sendValidationError(
    res: Response,
    message: string,
    errors: any[],
    status = HttpStatusCode.BAD_REQUEST,
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(status).json({
      success: false,
      error: {
        type: "ValidationError",
        message,
        details: { fieldErrors: errors },
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  // Quick error response methods for common scenarios
  sendNotFoundResponse(
    res: Response,
    message: string,
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      success: false,
      error: {
        type: "NotFoundError",
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  sendUnauthorizedResponse(
    res: Response,
    message = "Unauthorized",
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(HttpStatusCode.UNAUTHORIZED).json({
      success: false,
      error: {
        type: "UnauthorizedError",
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  sendForbiddenResponse(
    res: Response,
    message = "Forbidden",
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(HttpStatusCode.FORBIDDEN).json({
      success: false,
      error: {
        type: "ForbiddenError",
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  sendBadRequestResponse(
    res: Response,
    message: string,
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      error: {
        type: "BadRequestError",
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }

  sendInternalServerErrorResponse(
    res: Response,
    message = "Internal Server Error",
    requestId?: string
  ): Response<ErrorResponse> {
    return res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        type: "InternalServerError",
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    });
  }
}

export default ResponseUtils;
