import { Request, Response, NextFunction } from "express";
import { injectable } from "tsyringe";
import { AppError } from "../errors/AppError";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

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

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
