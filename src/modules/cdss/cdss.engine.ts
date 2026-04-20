import type { CDSSCandidate, CDSSEngine, CDSSInput } from "./cdss.types";

interface Rule {
  diagnosis: string;
  icd10?: string;
  required: string[];
  optional?: string[];
  baseConfidence: number;
  urgency?: CDSSCandidate["urgency"];
  recommendedDepartment?: string;
  reasoning?: string;
}

const RULES: Rule[] = [
  {
    diagnosis: "ISPA / Common Cold",
    icd10: "J00",
    required: ["cough", "runny_nose"],
    optional: ["fever", "sore_throat", "headache", "fatigue"],
    baseConfidence: 0.55,
    urgency: "low",
    recommendedDepartment: "UMUM",
    reasoning: "Gejala saluran napas atas ringan tanpa tanda bahaya.",
  },
  {
    diagnosis: "Influenza",
    icd10: "J11",
    required: ["fever", "cough"],
    optional: ["headache", "fatigue", "sore_throat"],
    baseConfidence: 0.6,
    urgency: "low",
    recommendedDepartment: "UMUM",
    reasoning: "Demam + batuk + gejala sistemik khas influenza.",
  },
  {
    diagnosis: "Gastroenteritis Akut",
    icd10: "A09",
    required: ["diarrhea"],
    optional: ["nausea", "abdominal_pain", "fever"],
    baseConfidence: 0.55,
    urgency: "medium",
    recommendedDepartment: "UMUM",
    reasoning: "Diare dengan atau tanpa mual dan nyeri perut.",
  },
  {
    diagnosis: "Suspek Angina / Masalah Kardiak",
    icd10: "I20",
    required: ["chest_pain"],
    optional: ["shortness_of_breath", "fatigue"],
    baseConfidence: 0.7,
    urgency: "high",
    recommendedDepartment: "INTERNA",
    reasoning: "Nyeri dada memerlukan evaluasi segera untuk menyingkirkan penyebab kardiak.",
  },
  {
    diagnosis: "Dermatitis / Alergi Kulit",
    icd10: "L23",
    required: ["rash"],
    optional: [],
    baseConfidence: 0.5,
    urgency: "low",
    recommendedDepartment: "UMUM",
    reasoning: "Ruam kulit tanpa gejala sistemik.",
  },
  {
    diagnosis: "Migrain / Tension Headache",
    icd10: "G43",
    required: ["headache"],
    optional: ["nausea", "fatigue"],
    baseConfidence: 0.45,
    urgency: "low",
    recommendedDepartment: "UMUM",
    reasoning: "Sakit kepala primer yang umum pada pasien dewasa.",
  },
];

function normalize(symptoms: string[]): string[] {
  return symptoms.map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"));
}

function scoreRule(rule: Rule, symptoms: Set<string>): CDSSCandidate | null {
  const matchedRequired = rule.required.filter((s) => symptoms.has(s));
  if (matchedRequired.length < rule.required.length) return null;

  const matchedOptional = (rule.optional ?? []).filter((s) => symptoms.has(s));
  const optionalBoost =
    (rule.optional?.length ?? 0) === 0
      ? 0
      : (matchedOptional.length / (rule.optional?.length ?? 1)) * 0.3;

  const confidence = Math.min(1, rule.baseConfidence + optionalBoost);
  const matchedSymptoms = [...matchedRequired, ...matchedOptional];

  return {
    diagnosis: rule.diagnosis,
    icd10: rule.icd10,
    confidence: Number(confidence.toFixed(2)),
    matchedSymptoms,
    reasoning: rule.reasoning,
    urgency: rule.urgency,
    recommendedDepartment: rule.recommendedDepartment,
  };
}

export const ruleBasedEngine: CDSSEngine = {
  name: "rule-based",
  version: "0.1.0",
  async recommend(input: CDSSInput): Promise<CDSSCandidate[]> {
    const symptomSet = new Set(normalize(input.symptoms));
    const candidates = RULES.map((rule) => scoreRule(rule, symptomSet))
      .filter((c): c is CDSSCandidate => c !== null)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return candidates;
  },
};
