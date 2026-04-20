import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { ValidationError } from "../utils/errors";

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validate parts of the request against Zod schemas and replace them with the
 * parsed (typed) values. Supports Zod v3 and v4.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query, parsed);
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params, parsed);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        }));
        return next(new ValidationError("Validation failed", issues));
      }
      next(err);
    }
  };
}
