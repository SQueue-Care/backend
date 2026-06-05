import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError("Authentication required"));
    if (roles.length === 0) return next();
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("Insufficient role"));
    }
    next();
  };
}
