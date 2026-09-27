import { Request, Response, NextFunction } from "express";
import { injectable } from "tsyringe";
import { AppError } from "../errors/AppError";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import multer from "multer";

@injectable()
export default class GlobalErrorHandler {
  handle(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    console.error("Error occurred:", error);

    // Handle custom application errors
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          type: error.name,
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: this.generateRequestId(),
          ...(error.details && { details: error.details }),
        },
      });
      return;
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const { statusCode, message } = this.handlePrismaError(error);
      res.status(statusCode).json({
        success: false,
        error: { message },
      });
      return;
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          message: "Validation failed",
          details: error.errors,
        },
      });
      return;
    }

    // Handle upload errors (file too large, too many files, unexpected field)
    if (error instanceof multer.MulterError) {
      const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(statusCode).json({
        success: false,
        error: {
          type: "UPLOAD_ERROR",
          message: this.multerMessage(error),
          code: error.code,
          timestamp: new Date().toISOString(),
          requestId: this.generateRequestId(),
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

    // Client errors raised by Express middleware (body-parser: 413 payload too large,
    // 415 unsupported charset, 400 bad encoding, ...) carry their own 4xx status
    const status = (error as any).status ?? (error as any).statusCode;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      res.status(status).json({
        success: false,
        error: {
          type: (error as any).type || error.name,
          message: status === 413
            ? "Request body is too large. Split the import into smaller batches."
            : error.message,
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

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): { statusCode: number; message: string } {
    switch (error.code) {
      case "P2002": // Unique constraint violation
        return {
          statusCode: 409,
          message: `A record with this ${error.meta?.target || "field"} already exists`
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

  private multerMessage(error: multer.MulterError): string {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return 'File is too large';
      case 'LIMIT_FILE_COUNT':
        return 'Too many files';
      case 'LIMIT_UNEXPECTED_FILE':
        return `Unexpected file field${error.field ? `: ${error.field}` : ''}`;
      default:
        return error.message;
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
