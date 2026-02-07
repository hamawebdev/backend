"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const HttpStatusCode_1 = __importDefault(require("./HttpStatusCode"));
const AppError_1 = require("../errors/AppError");
const QuizErrors_1 = require("../errors/QuizErrors");
let ResponseUtils = class ResponseUtils {
    generateRequestId() {
        return Math.random().toString(36).substring(2, 15);
    }
    // Success response with data
    sendSuccessResponse(res, data, status = HttpStatusCode_1.default.OK, requestId) {
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
    sendSuccessNoDataResponse(res, message = "Operation successful", status = HttpStatusCode_1.default.OK, requestId) {
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
    sendErrorResponse(res, error, requestId) {
        const timestamp = new Date().toISOString();
        const reqId = requestId || this.generateRequestId();
        // Handle AppError instances
        if (error instanceof AppError_1.AppError) {
            const errorResponse = {
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
            if (error instanceof QuizErrors_1.RateLimitExceededError) {
                const retryMatch = error.message.match(/(\d+) seconds/);
                if (retryMatch) {
                    errorResponse.error.retryAfter = parseInt(retryMatch[1]);
                    res.set('Retry-After', retryMatch[1]);
                }
            }
            return res.status(error.statusCode).json(errorResponse);
        }
        // Handle generic errors
        const status = error.statusCode || HttpStatusCode_1.default.INTERNAL_SERVER_ERROR;
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
    sendValidationError(res, message, errors, status = HttpStatusCode_1.default.BAD_REQUEST, requestId) {
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
    sendNotFoundResponse(res, message, requestId) {
        return res.status(HttpStatusCode_1.default.NOT_FOUND).json({
            success: false,
            error: {
                type: "NotFoundError",
                message,
                timestamp: new Date().toISOString(),
                requestId: requestId || this.generateRequestId()
            }
        });
    }
    sendUnauthorizedResponse(res, message = "Unauthorized", requestId) {
        return res.status(HttpStatusCode_1.default.UNAUTHORIZED).json({
            success: false,
            error: {
                type: "UnauthorizedError",
                message,
                timestamp: new Date().toISOString(),
                requestId: requestId || this.generateRequestId()
            }
        });
    }
    sendForbiddenResponse(res, message = "Forbidden", requestId) {
        return res.status(HttpStatusCode_1.default.FORBIDDEN).json({
            success: false,
            error: {
                type: "ForbiddenError",
                message,
                timestamp: new Date().toISOString(),
                requestId: requestId || this.generateRequestId()
            }
        });
    }
    sendBadRequestResponse(res, message, requestId) {
        return res.status(HttpStatusCode_1.default.BAD_REQUEST).json({
            success: false,
            error: {
                type: "BadRequestError",
                message,
                timestamp: new Date().toISOString(),
                requestId: requestId || this.generateRequestId()
            }
        });
    }
    sendInternalServerErrorResponse(res, message = "Internal Server Error", requestId) {
        return res.status(HttpStatusCode_1.default.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: {
                type: "InternalServerError",
                message,
                timestamp: new Date().toISOString(),
                requestId: requestId || this.generateRequestId()
            }
        });
    }
};
ResponseUtils = __decorate([
    (0, tsyringe_1.singleton)(),
    (0, tsyringe_1.injectable)()
], ResponseUtils);
exports.default = ResponseUtils;
