import { Gender } from "@prisma/client";
import { describe, it, expect } from "vitest";
import {
  isCdssAiAvailable,
  mapGenderToSmartQueue,
  mapSmartQueueCandidates,
  mapUrgency,
} from "../../src/modules/cdss/cdss.smartqueue";

describe("mapGenderToSmartQueue", () => {
  it("maps MALE to L and FEMALE to P", () => {
    expect(mapGenderToSmartQueue(Gender.MALE)).toBe("L");
    expect(mapGenderToSmartQueue(Gender.FEMALE)).toBe("P");
    expect(mapGenderToSmartQueue(Gender.OTHER)).toBeUndefined();
  });
});

describe("mapUrgency", () => {
  it("normalizes urgency levels", () => {
    expect(mapUrgency("HIGH")).toBe("high");
    expect(mapUrgency("medium")).toBe("medium");
    expect(mapUrgency("low")).toBe("low");
  });
});

describe("mapSmartQueueCandidates", () => {
  it("maps FastAPI payload to internal CDSS candidates", () => {
    const mapped = mapSmartQueueCandidates([
      {
        nama_penyakit: "Pneumonia",
        tingkat_urgensi: "HIGH",
        confidence: 85,
        departemen: "PARU",
        penjelasan: "Infeksi paru",
        pemeriksaan_lanjutan: ["Rontgen Thorax"],
      },
    ]);

    expect(mapped[0]).toMatchObject({
      diagnosis: "Pneumonia",
      confidence: 0.85,
      confidencePercent: 85,
      urgency: "high",
      recommendedDepartment: "PARU",
      pemeriksaanLanjutan: ["Rontgen Thorax"],
    });
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
