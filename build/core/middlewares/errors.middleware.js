"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
let GlobalErrorHandler = class GlobalErrorHandler {
    handle(error, req, res, next) {
        console.error("Error occurred:", error);
        // Handle custom application errors
        if (error instanceof AppError_1.AppError) {
            res.status(error.statusCode).json({
                success: false,
                error: Object.assign({ type: error.name, message: error.message, timestamp: new Date().toISOString(), requestId: this.generateRequestId() }, (error.details && { details: error.details })),
            });
            return;
        }
        // Handle Prisma errors
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            const { statusCode, message } = this.handlePrismaError(error);
            res.status(statusCode).json({
                success: false,
                error: { message },
            });
            return;
        }
        // Handle Zod validation errors
        if (error instanceof zod_1.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    message: "Validation failed",
                    details: error.errors,
                },
            });
            return;
        }
        // Handle JSON parsing errors
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            res.status(400).json({
                success: false,
                error: {
                    type: "JSON_PARSE_ERROR",
                    message: "Invalid JSON format in request body",
                    details: "Please check your JSON syntax and try again",
                    timestamp: new Date().toISOString(),
                    requestId: this.generateRequestId(),
                },
            });
            return;
        }
        // Handle generic errors
        res.status(500).json({
            success: false,
            error: {
                message: "Internal server error",
            },
        });
    }
    handlePrismaError(error) {
        var _a;
        switch (error.code) {
            case "P2002": // Unique constraint violation
                return {
                    statusCode: 409,
                    message: `A record with this ${((_a = error.meta) === null || _a === void 0 ? void 0 : _a.target) || "field"} already exists`
                };
            case "P2025": // Record not found
                return {
                    statusCode: 404,
                    message: "Record not found"
                };
            default:
                return {
                    statusCode: 500,
                    message: "Database error occurred"
                };
        }
    }
    generateRequestId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
};
GlobalErrorHandler = __decorate([
    (0, tsyringe_1.injectable)()
], GlobalErrorHandler);
exports.default = GlobalErrorHandler;
