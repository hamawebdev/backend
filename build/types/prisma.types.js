"use strict";
/**
 * Prisma utility types for consistent typing across the codebase.
 * This file provides type definitions for common Prisma patterns.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaClientKnownRequestError = void 0;
const client_1 = require("@prisma/client");
// Re-export PrismaClientKnownRequestError for error handling
exports.PrismaClientKnownRequestError = client_1.Prisma.PrismaClientKnownRequestError;
