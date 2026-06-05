import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiResponse } from "../utils/api-response";
import { AppError } from "../utils/errors";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ApiResponse.error(err.message, err.code, err.details));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = mapPrismaError(err);
    res
      .status(prismaError.statusCode)
      .json(ApiResponse.error(prismaError.message, prismaError.code));
    return;
  }

  logger.error({ err, path: req.originalUrl, method: req.method }, "Unhandled error");

  const isProd = env.NODE_ENV === "production";
  res
    .status(500)
    .json(
      ApiResponse.error(
        isProd ? "Internal server error" : ((err as Error)?.message ?? "Internal server error"),
        "INTERNAL_ERROR",
      ),
    );
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
  code: string;
} {
  switch (err.code) {
    case "P2002":
      return {
        statusCode: 409,
        message: `Unique constraint violated on: ${(err.meta?.target as string[] | string) ?? "field"}`,
        code: "UNIQUE_VIOLATION",
      };
    case "P2025":
      return { statusCode: 404, message: "Record not found", code: "NOT_FOUND" };
    case "P2003":
      return {
        statusCode: 400,
        message: "Foreign key constraint failed",
        code: "FOREIGN_KEY_VIOLATION",
      };
    default:
      return { statusCode: 400, message: err.message, code: err.code };
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .json(ApiResponse.error(`Route ${req.method} ${req.originalUrl} not found`, "ROUTE_NOT_FOUND"));
}
