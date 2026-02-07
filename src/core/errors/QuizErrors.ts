import { AppError, BadRequestError, NotFoundError, ForbiddenError, InternalServerError } from './AppError';

// Quiz Session Specific Errors
export class SessionNotFoundError extends NotFoundError {
  constructor(sessionId: number) {
    super(`Quiz session '${sessionId}' not found or does not belong to you`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionCompletedError extends BadRequestError {
  constructor(sessionId: number) {
    super(`Cannot modify completed quiz session '${sessionId}'`);
    this.name = 'SessionCompletedError';
  }
}

export class SessionStatusError extends BadRequestError {
  constructor(currentStatus: string, requiredStatus: string[]) {
    super(`Session must be in ${requiredStatus.join(' or ')} status. Current status: ${currentStatus}`);
    this.name = 'SessionStatusError';
  }
}

// Question and Answer Validation Errors
export class InsufficientQuestionsError extends BadRequestError {
  constructor(requested: number, available: number) {
    super(`Insufficient questions: requested ${requested}, available ${available}`);
    this.name = 'InsufficientQuestionsError';
  }
}

export class InvalidAnswerError extends BadRequestError {
  constructor(answerId: number, questionId: number) {
    super(`Answer '${answerId}' does not belong to question '${questionId}'`);
    this.name = 'InvalidAnswerError';
  }
}

export class QuestionNotInSessionError extends BadRequestError {
  constructor(questionId: number, sessionId: number) {
    super(`Question '${questionId}' does not belong to session '${sessionId}'`);
    this.name = 'QuestionNotInSessionError';
  }
}

export class DuplicateAnswerError extends BadRequestError {
  constructor(questionId: number) {
    super(`Answer already submitted for question '${questionId}'`);
    this.name = 'DuplicateAnswerError';
  }
}

// Subscription and Access Errors
export class SubscriptionRequiredError extends ForbiddenError {
  constructor(feature: string) {
    super(`Active subscription required to access ${feature}`);
    this.name = 'SubscriptionRequiredError';
  }
}

export class SubscriptionExpiredError extends ForbiddenError {
  constructor() {
    super('Your subscription has expired. Please renew to continue using quiz features');
    this.name = 'SubscriptionExpiredError';
  }
}

// Quiz Creation Errors
export class InvalidQuizConfigurationError extends BadRequestError {
  constructor(message: string) {
    super(`Invalid quiz configuration: ${message}`);
    this.name = 'InvalidQuizConfigurationError';
  }
}

export class QuizCreationFailedError extends InternalServerError {
  constructor(reason?: string) {
    super(`Failed to create quiz session${reason ? `: ${reason}` : ''}`);
    this.name = 'QuizCreationFailedError';
  }
}

// Rate Limiting Errors
export class RateLimitExceededError extends BadRequestError {
  constructor(action: string, retryAfter?: number) {
    super(`Too many ${action} requests. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : 'Please try again later.'}`);
    this.name = 'RateLimitExceededError';
  }
}

// Filter and Search Errors
export class InvalidFilterError extends BadRequestError {
  constructor(filterName: string, message: string) {
    super(`Invalid ${filterName} filter: ${message}`);
    this.name = 'InvalidFilterError';
  }
}

export class NoQuestionsFoundError extends NotFoundError {
  constructor(filters: any) {
    const filterString = Object.entries(filters)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    super(`No questions found matching the specified filters: ${filterString}`);
    this.name = 'NoQuestionsFoundError';
  }
}

// Exam Specific Errors
export class ExamNotFoundError extends NotFoundError {
  constructor(examId: number) {
    super(`Exam '${examId}' not found or not accessible`);
    this.name = 'ExamNotFoundError';
  }
}

export class ExamNotAvailableError extends BadRequestError {
  constructor(examId: number, reason: string) {
    super(`Exam '${examId}' is not available: ${reason}`);
    this.name = 'ExamNotAvailableError';
  }
}

// User Access Errors
export class AccessDeniedError extends ForbiddenError {
  constructor(resource: string, reason?: string) {
    super(`Access denied to ${resource}${reason ? `: ${reason}` : ''}`);
    this.name = 'AccessDeniedError';
  }
}

export class UserNotActiveError extends ForbiddenError {
  constructor() {
    super('User account is not active. Please contact support');
    this.name = 'UserNotActiveError';
  }
} 