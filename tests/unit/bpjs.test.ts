import { describe, it, expect } from "vitest";
import { verifyByNik } from "../../src/modules/bpjs/bpjs.service";

describe("BPJS mock service", () => {
  it("returns data for known NIK", () => {
    const result = verifyByNik("3201010101010001");
    expect(result.status).toBe("ACTIVE");
    expect(result.bpjsNumber).toBeTruthy();
  });

  it("throws for unknown NIK", () => {
    expect(() => verifyByNik("9999999999999999")).toThrow();
  });
});
