import { describe, it, expect } from "vitest";
import { ruleBasedEngine } from "../../src/modules/cdss/cdss.engine";

describe("ruleBasedEngine", () => {
  it("returns influenza candidate when fever + cough present", async () => {
    const candidates = await ruleBasedEngine.recommend({
      symptoms: ["fever", "cough", "headache"],
    });
    expect(candidates.length).toBeGreaterThan(0);
    const diagnoses = candidates.map((c) => c.diagnosis);
    expect(diagnoses).toContain("Influenza");
  });

  it("flags chest pain as high urgency", async () => {
    const candidates = await ruleBasedEngine.recommend({ symptoms: ["chest_pain"] });
    const cardiac = candidates.find((c) => c.diagnosis.toLowerCase().includes("angina"));
    expect(cardiac).toBeDefined();
    expect(cardiac!.urgency).toBe("high");
  });

  it("returns empty list for unknown symptoms", async () => {
    const candidates = await ruleBasedEngine.recommend({ symptoms: ["unknown_symptom"] });
    expect(candidates).toEqual([]);
  });

  it("sorts candidates by confidence desc", async () => {
    const candidates = await ruleBasedEngine.recommend({
      symptoms: ["fever", "cough", "headache", "fatigue", "sore_throat"],
    });
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1]!.confidence).toBeGreaterThanOrEqual(candidates[i]!.confidence);
    }
  });
});
