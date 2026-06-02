import { Gender } from "@prisma/client";
import { describe, it, expect } from "vitest";
import { isCdssAiAvailable, mapGenderToSmartQueue } from "../../src/modules/cdss/cdss.smartqueue";

describe("mapGenderToSmartQueue", () => {
  it("maps MALE to L and FEMALE to P", () => {
    expect(mapGenderToSmartQueue(Gender.MALE)).toBe("L");
    expect(mapGenderToSmartQueue(Gender.FEMALE)).toBe("P");
    expect(mapGenderToSmartQueue(Gender.OTHER)).toBeUndefined();
  });
});

describe("isCdssAiAvailable", () => {
  it("returns true only when healthy and key configured", () => {
    expect(
      isCdssAiAvailable({
        status: "healthy",
        gemini_api_configured: true,
        message: "ok",
      }),
    ).toBe(true);
    expect(
      isCdssAiAvailable({
        status: "not_configured",
        gemini_api_configured: false,
        message: "missing key",
      }),
    ).toBe(false);
  });
});
