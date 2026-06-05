import { describe, expect, it } from "vitest";
import { TargetRole } from "@prisma/client";

describe("notification target roles", () => {
  function matchesTargetRole(
    userRole: "PATIENT" | "DOCTOR" | "ADMIN",
    target: TargetRole,
  ): boolean {
    if (target === TargetRole.ALL) return true;
    if (target === TargetRole.PATIENT) return userRole === "PATIENT";
    if (target === TargetRole.DOCTOR) return userRole === "DOCTOR";
    if (target === TargetRole.ADMIN) return userRole === "ADMIN";
    return false;
  }

  it("matches ALL for every role", () => {
    expect(matchesTargetRole("PATIENT", TargetRole.ALL)).toBe(true);
    expect(matchesTargetRole("DOCTOR", TargetRole.ALL)).toBe(true);
    expect(matchesTargetRole("ADMIN", TargetRole.ALL)).toBe(true);
  });

  it("matches specific role only", () => {
    expect(matchesTargetRole("PATIENT", TargetRole.PATIENT)).toBe(true);
    expect(matchesTargetRole("DOCTOR", TargetRole.PATIENT)).toBe(false);
  });
});
