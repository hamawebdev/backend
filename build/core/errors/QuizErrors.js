"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserNotActiveError = exports.AccessDeniedError = exports.ExamNotAvailableError = exports.ExamNotFoundError = exports.NoQuestionsFoundError = exports.InvalidFilterError = exports.RateLimitExceededError = exports.QuizCreationFailedError = exports.InvalidQuizConfigurationError = exports.SubscriptionExpiredError = exports.SubscriptionRequiredError = exports.DuplicateAnswerError = exports.QuestionNotInSessionError = exports.InvalidAnswerError = exports.InsufficientQuestionsError = exports.SessionStatusError = exports.SessionCompletedError = exports.SessionNotFoundError = void 0;
const AppError_1 = require("./AppError");
// Quiz Session Specific Errors
class SessionNotFoundError extends AppError_1.NotFoundError {
    constructor(sessionId) {
        super(`Quiz session '${sessionId}' not found or does not belong to you`);
        this.name = 'SessionNotFoundError';
    }
}
exports.SessionNotFoundError = SessionNotFoundError;
class SessionCompletedError extends AppError_1.BadRequestError {
    constructor(sessionId) {
        super(`Cannot modify completed quiz session '${sessionId}'`);
        this.name = 'SessionCompletedError';
    }
}
exports.SessionCompletedError = SessionCompletedError;
class SessionStatusError extends AppError_1.BadRequestError {
    constructor(currentStatus, requiredStatus) {
        super(`Session must be in ${requiredStatus.join(' or ')} status. Current status: ${currentStatus}`);
        this.name = 'SessionStatusError';
    }
}
exports.SessionStatusError = SessionStatusError;
// Question and Answer Validation Errors
class InsufficientQuestionsError extends AppError_1.BadRequestError {
    constructor(requested, available) {
        super(`Insufficient questions: requested ${requested}, available ${available}`);
        this.name = 'InsufficientQuestionsError';
    }
}
exports.InsufficientQuestionsError = InsufficientQuestionsError;
class InvalidAnswerError extends AppError_1.BadRequestError {
    constructor(answerId, questionId) {
        super(`Answer '${answerId}' does not belong to question '${questionId}'`);
        this.name = 'InvalidAnswerError';
    }
}
exports.InvalidAnswerError = InvalidAnswerError;
class QuestionNotInSessionError extends AppError_1.BadRequestError {
    constructor(questionId, sessionId) {
        super(`Question '${questionId}' does not belong to session '${sessionId}'`);
        this.name = 'QuestionNotInSessionError';
    }
}
exports.QuestionNotInSessionError = QuestionNotInSessionError;
class DuplicateAnswerError extends AppError_1.BadRequestError {
    constructor(questionId) {
        super(`Answer already submitted for question '${questionId}'`);
        this.name = 'DuplicateAnswerError';
    }
}
exports.DuplicateAnswerError = DuplicateAnswerError;
// Subscription and Access Errors
class SubscriptionRequiredError extends AppError_1.ForbiddenError {
    constructor(feature) {
        super(`Active subscription required to access ${feature}`);
        this.name = 'SubscriptionRequiredError';
    }
}
exports.SubscriptionRequiredError = SubscriptionRequiredError;
class SubscriptionExpiredError extends AppError_1.ForbiddenError {
    constructor() {
        super('Your subscription has expired. Please renew to continue using quiz features');
        this.name = 'SubscriptionExpiredError';
    }
}
exports.SubscriptionExpiredError = SubscriptionExpiredError;
// Quiz Creation Errors
class InvalidQuizConfigurationError extends AppError_1.BadRequestError {
    constructor(message) {
        super(`Invalid quiz configuration: ${message}`);
        this.name = 'InvalidQuizConfigurationError';
    }
}
exports.InvalidQuizConfigurationError = InvalidQuizConfigurationError;
class QuizCreationFailedError extends AppError_1.InternalServerError {
    constructor(reason) {
        super(`Failed to create quiz session${reason ? `: ${reason}` : ''}`);
        this.name = 'QuizCreationFailedError';
    }
}
exports.QuizCreationFailedError = QuizCreationFailedError;
// Rate Limiting Errors
class RateLimitExceededError extends AppError_1.BadRequestError {
    constructor(action, retryAfter) {
        super(`Too many ${action} requests. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : 'Please try again later.'}`);
        this.name = 'RateLimitExceededError';
    }
}
exports.RateLimitExceededError = RateLimitExceededError;
// Filter and Search Errors
class InvalidFilterError extends AppError_1.BadRequestError {
    constructor(filterName, message) {
        super(`Invalid ${filterName} filter: ${message}`);
        this.name = 'InvalidFilterError';
    }
}
exports.InvalidFilterError = InvalidFilterError;
class NoQuestionsFoundError extends AppError_1.NotFoundError {
    constructor(filters) {
        const filterString = Object.entries(filters)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join(', ');
        super(`No questions found matching the specified filters: ${filterString}`);
        this.name = 'NoQuestionsFoundError';
    }
}
exports.NoQuestionsFoundError = NoQuestionsFoundError;
// Exam Specific Errors
class ExamNotFoundError extends AppError_1.NotFoundError {
    constructor(examId) {
        super(`Exam '${examId}' not found or not accessible`);
        this.name = 'ExamNotFoundError';
    }
}
exports.ExamNotFoundError = ExamNotFoundError;
class ExamNotAvailableError extends AppError_1.BadRequestError {
    constructor(examId, reason) {
        super(`Exam '${examId}' is not available: ${reason}`);
        this.name = 'ExamNotAvailableError';
    }
}
exports.ExamNotAvailableError = ExamNotAvailableError;
// User Access Errors
class AccessDeniedError extends AppError_1.ForbiddenError {
    constructor(resource, reason) {
        super(`Access denied to ${resource}${reason ? `: ${reason}` : ''}`);
        this.name = 'AccessDeniedError';
    }
}
exports.AccessDeniedError = AccessDeniedError;
class UserNotActiveError extends AppError_1.ForbiddenError {
    constructor() {
        super('User account is not active. Please contact support');
        this.name = 'UserNotActiveError';
    }
}
exports.UserNotActiveError = UserNotActiveError;
