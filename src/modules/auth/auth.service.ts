import { Role, type User } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ConflictError, UnauthorizedError } from "../../utils/errors";
import { signAccessToken, signRefreshToken, ttlToDate, verifyRefreshToken } from "../../utils/jwt";
import { hashPassword, sha256, verifyPassword } from "../../utils/password";
import type { LoginInput, RegisterInput } from "./auth.schema";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthResult extends AuthTokens {
  user: Pick<User, "id" | "email" | "name" | "role">;
}

async function issueTokens(user: Pick<User, "id" | "email" | "role">): Promise<AuthTokens> {
  const refreshRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: "__placeholder__",
      expiresAt: ttlToDate(env.JWT_REFRESH_TTL),
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, tokenId: refreshRecord.id });
  await prisma.refreshToken.update({
    where: { id: refreshRecord.id },
    data: { tokenHash: sha256(refreshToken) },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { accessToken, refreshToken, expiresAt: refreshRecord.expiresAt };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email sudah terdaftar");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role ?? Role.PATIENT,
      ...(input.role === Role.PATIENT || !input.role ? { patient: { create: {} } } : {}),
    },
  });

  const tokens = await issueTokens(user);
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ...tokens,
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) throw new UnauthorizedError("Email atau password salah");

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Email atau password salah");

  const tokens = await issueTokens(user);
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ...tokens,
  };
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const record = await prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token expired or revoked");
  }
  if (record.tokenHash !== sha256(refreshToken)) {
    throw new UnauthorizedError("Refresh token mismatch");
  }
  if (record.userId !== payload.sub) {
    throw new UnauthorizedError("Refresh token invalid");
  }

  // Rotation: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
  return issueTokens(user);
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // ignore — logout harus idempotent
  }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patient: true, doctor: true },
  });
  if (!user) throw new UnauthorizedError("User not found");
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}
