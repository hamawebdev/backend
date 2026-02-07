"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalServerError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
const HttpStatusCode_1 = __importDefault(require("../utils/HttpStatusCode"));
class AppError extends Error {
    constructor(message, statusCode, details, code) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        this.name = "AppError";
        this.code = code;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    constructor(message = "Bad Request", details) {
        super(message, HttpStatusCode_1.default.BAD_REQUEST, details);
        this.name = "BadRequestError";
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized", details) {
        super(message, HttpStatusCode_1.default.UNAUTHORIZED, details);
        this.name = "UnauthorizedError";
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = "Forbidden", details) {
        super(message, HttpStatusCode_1.default.FORBIDDEN, details);
        this.name = "ForbiddenError";
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(resource, id, details) {
        const message = id
            ? `${resource} with id ${id} not found`
            : `${resource} not found`;
        super(message, HttpStatusCode_1.default.NOT_FOUND, details);
        this.name = "NotFoundError";
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = "Conflict", details) {
        super(message, HttpStatusCode_1.default.CONFLICT, details);
        this.name = "ConflictError";
    }
}
exports.ConflictError = ConflictError;
class InternalServerError extends AppError {
    constructor(message = "Internal Server Error", details) {
        super(message, HttpStatusCode_1.default.INTERNAL_SERVER_ERROR, details);
        this.name = "InternalServerError";
    }
}
exports.InternalServerError = InternalServerError;
