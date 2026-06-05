import type { Request, Response } from "express";
import { ApiResponse } from "../../utils/api-response";
import { UnauthorizedError } from "../../utils/errors";
import * as authService from "./auth.service";

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register(req.body);
  res.status(201).json(ApiResponse.success(result));
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body);
  res.json(ApiResponse.success(result));
}

export async function refreshHandler(req: Request, res: Response) {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.json(ApiResponse.success(tokens));
}

export async function logoutHandler(req: Request, res: Response) {
  await authService.logout(req.body.refreshToken);
  res.json(ApiResponse.success({ message: "Logged out" }));
}

export async function meHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const me = await authService.getMe(req.user.id);
  res.json(ApiResponse.success(me));
}
