import HttpStatusCode from "../utils/HttpStatusCode";

export class AppError extends Error {
  public isOperational: boolean = true;
  public code?: string;

  constructor(
    public message: string,
    public statusCode: number,
    public details?: any,
    code?: string
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", details?: any) {
    super(message, HttpStatusCode.BAD_REQUEST, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: any) {
    super(message, HttpStatusCode.UNAUTHORIZED, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: any) {
    super(message, HttpStatusCode.FORBIDDEN, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string, details?: any) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;
    super(message, HttpStatusCode.NOT_FOUND, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: any) {
    super(message, HttpStatusCode.CONFLICT, details);
    this.name = "ConflictError";
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal Server Error", details?: any) {
    super(message, HttpStatusCode.INTERNAL_SERVER_ERROR, details);
    this.name = "InternalServerError";
  }
}
