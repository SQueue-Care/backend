import type { NextFunction, Request, RequestHandler, Response } from "express";
import { BadRequestError } from "./errors";

/**
 * Wrap async controllers so any thrown error is forwarded to the global error handler.
 * Express 5 handles rejected promises natively, but this keeps behavior explicit.
 */
export function asyncHandler<Req extends Request = Request, Res extends Response = Response>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };
}

/**
 * Express 5's ParamsDictionary types values as `string | string[]`. Our Zod param
 * schemas always coerce them to strings, so this helper centralizes the narrowing.
 */
export function getParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`Missing or invalid route param: ${key}`);
  }
  return value;
}
