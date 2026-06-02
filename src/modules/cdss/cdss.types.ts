/** SmartQueue AI CDSS — struktur selaras Postman collection */

export interface CdssKandidatDiagnosis {
  nama_penyakit: string;
  tingkat_urgensi: string;
  confidence: number;
  departemen: string;
  penjelasan: string;
  pemeriksaan_lanjutan: string[];
}

export interface CdssRecommendResponse {
  id: string;
  gejala_teridentifikasi: string[];
  kandidat_diagnosis: CdssKandidatDiagnosis[];
  catatan_medis: string;
  disclaimer: string;
  status: "success";
  gejala?: string;
  notes?: string | null;
  createdAt?: Date;
  patient?: {
    id: string;
    user: { name: string };
  };
}

export interface CdssHealthResponse {
  status: string;
  gemini_api_configured: boolean;
  message: string;
}

/** Legacy rule-based engine (tidak dipakai pada alur SmartQueue CDSS) */
export interface CDSSCandidate {
  diagnosis: string;
  icd10?: string;
  confidence: number;
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
