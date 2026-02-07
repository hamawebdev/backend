import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { container } from "../../config/container";
import ResponseUtils from "../utils/response.utils";
import { BadRequestError } from "../errors/AppError";

export const validateRequest =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        // Map the Zod errors to a custom error structure with 'field' and 'message'
        const formattedErrors = result.error.errors.map((err) => ({
          field: err.path.join("."), // Join the path if it's a nested field
          message: err.message,
        }));

        const responseUtils = container.resolve(ResponseUtils);
        responseUtils.sendValidationError(res, "Validation failed", formattedErrors);
        return;
      }

      // Assign parsed data to req.body
      req.body = result.success ? result.data : req.body;
      next();
    } catch (error) {
      next(new BadRequestError("Invalid request data"));
    }
  };
