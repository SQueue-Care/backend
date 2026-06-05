import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, sha256 } from "../../src/utils/password";

describe("password utilities", () => {
  it("hashes and verifies passwords correctly", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("sha256 returns deterministic hex string", () => {
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
