import type { Role } from "@prisma/client";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET as Secret, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET as Secret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as RefreshTokenPayload;
}

/**
 * Calculate expiry date from TTL string like "15m", "7d", "3600".
 * Falls back to 15 minutes if invalid.
 */
export function ttlToDate(ttl: string, from: Date = new Date()): Date {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(ttl.trim());
  if (!match) return new Date(from.getTime() + 15 * 60 * 1000);
  const value = Number(match[1]);
  const unit = (match[2] ?? "s") as "s" | "m" | "h" | "d";
  const multipliers: Record<typeof unit, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(from.getTime() + value * multipliers[unit]);
}
