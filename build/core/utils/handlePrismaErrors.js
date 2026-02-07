"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handlePrismaErrors;
const HttpStatusCode_1 = __importDefault(require("./HttpStatusCode"));
function handlePrismaErrors(error) {
    var _a;
    console.error("Prisma error:", error);
    switch (error.code) {
        case "P2002": // Unique constraint violation
            return {
                statusCode: HttpStatusCode_1.default.CONFLICT,
                message: `A record with this ${((_a = error.meta) === null || _a === void 0 ? void 0 : _a.target) || "field"} already exists`,
            };
        case "P2025": // Record not found
            return {
                statusCode: HttpStatusCode_1.default.NOT_FOUND,
                message: "Record not found",
            };
        case "P2003": // Foreign key constraint violation
            return {
                statusCode: HttpStatusCode_1.default.BAD_REQUEST,
                message: "Invalid reference to related record",
            };
        case "P2014": // Required relation violation
            return {
                statusCode: HttpStatusCode_1.default.BAD_REQUEST,
                message: "Required relation is missing",
            };
        default:
            return {
                statusCode: HttpStatusCode_1.default.INTERNAL_SERVER_ERROR,
                message: "Database error occurred",
            };
    }
}
