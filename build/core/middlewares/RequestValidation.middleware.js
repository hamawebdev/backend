"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const container_1 = require("../../config/container");
const response_utils_1 = __importDefault(require("../utils/response.utils"));
const AppError_1 = require("../errors/AppError");
const validateRequest = (schema) => (req, res, next) => {
    try {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            // Map the Zod errors to a custom error structure with 'field' and 'message'
            const formattedErrors = result.error.errors.map((err) => ({
                field: err.path.join("."), // Join the path if it's a nested field
                message: err.message,
            }));
            const responseUtils = container_1.container.resolve(response_utils_1.default);
            responseUtils.sendValidationError(res, "Validation failed", formattedErrors);
            return;
        }
        // Assign parsed data to req.body
        req.body = result.success ? result.data : req.body;
        next();
    }
    catch (error) {
        next(new AppError_1.BadRequestError("Invalid request data"));
    }
};
exports.validateRequest = validateRequest;
