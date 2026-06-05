import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ttlToDate,
} from "../../src/utils/jwt";

describe("JWT utilities", () => {
  it("signs and verifies access tokens roundtrip", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@b.com", role: Role.PATIENT });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@b.com");
    expect(payload.role).toBe(Role.PATIENT);
  });

  it("signs and verifies refresh tokens roundtrip", () => {
    const token = signRefreshToken({ sub: "user-1", tokenId: "tid" });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.tokenId).toBe("tid");
  });

  it("ttlToDate parses common formats", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    expect(ttlToDate("15m", base).getTime() - base.getTime()).toBe(15 * 60_000);
    expect(ttlToDate("1h", base).getTime() - base.getTime()).toBe(60 * 60_000);
    expect(ttlToDate("7d", base).getTime() - base.getTime()).toBe(7 * 86_400_000);
  });
});
