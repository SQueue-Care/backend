export interface CDSSCandidate {
  diagnosis: string;
  icd10?: string;
  confidence: number; // 0..1
  matchedSymptoms: string[];
  reasoning?: string;
  urgency?: "low" | "medium" | "high";
  recommendedDepartment?: string;
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
