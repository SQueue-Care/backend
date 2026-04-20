import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../utils/errors";
import { verifyAccessToken } from "../utils/jwt";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing Bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedError("Invalid token");

    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError("Invalid or expired token"));
  }
}
