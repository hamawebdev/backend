import { Prisma } from "@prisma/client";
import HttpStatusCode from "./HttpStatusCode";

export default function handlePrismaErrors(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
} {
  console.error("Prisma error:", error);

  switch (error.code) {
    case "P2002": // Unique constraint violation
      return {
        statusCode: HttpStatusCode.CONFLICT,
        message: `A record with this ${error.meta?.target || "field"} already exists`,
      };

    case "P2025": // Record not found
      return {
        statusCode: HttpStatusCode.NOT_FOUND,
        message: "Record not found",
      };

    case "P2003": // Foreign key constraint violation
      return {
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "Invalid reference to related record",
      };

    case "P2014": // Required relation violation
      return {
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "Required relation is missing",
      };

    default:
      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        message: "Database error occurred",
      };
  }
}
