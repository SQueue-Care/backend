export interface CDSSCandidate {
  diagnosis: string;
  icd10?: string;
  confidence: number; // 0..1
  confidencePercent?: number; // 1..100 from Gemini CDSS
  matchedSymptoms: string[];
  reasoning?: string;
  urgency?: "low" | "medium" | "high";
  recommendedDepartment?: string;
  pemeriksaanLanjutan?: string[];
}

export type CDSSEngineSource = "gemini" | "rule-based" | "legacy-llm";

export interface RecommendResult {
  id: string;
  engine: string;
  source: CDSSEngineSource;
  version?: string;
  disclaimer: string;
  identifiedSymptoms?: string[];
  catatanMedis?: string;
  candidates: CDSSCandidate[];
}

export interface CDSSInput {
  symptoms: string[];
  patientId?: string;
  doctorId?: string;
}

export interface CDSSEngine {
  name: string;
  version: string;
  recommend(input: CDSSInput): Promise<CDSSCandidate[]>;
}
