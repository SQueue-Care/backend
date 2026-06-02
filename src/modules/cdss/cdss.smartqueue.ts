import { Gender } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { CDSSCandidate } from "./cdss.types";

const CDSS_TIMEOUT_MS = 30_000;

export interface SmartQueueCdssRequest {
  gejala: string;
  umur?: number;
  jenis_kelamin?: "L" | "P";
}

export interface SmartQueueCdssCandidate {
  nama_penyakit: string;
  tingkat_urgensi: string;
  confidence: number;
  departemen: string;
  penjelasan: string;
  pemeriksaan_lanjutan: string[];
}

export interface SmartQueueCdssResponse {
  gejala_teridentifikasi: string[];
  kandidat_diagnosis: SmartQueueCdssCandidate[];
  catatan_medis: string;
  disclaimer: string;
  status: string;
}

export interface SmartQueueCdssHealth {
  status: "healthy" | "not_configured" | string;
  gemini_api_configured: boolean;
  message: string;
}

export function mapGenderToSmartQueue(gender: Gender | null | undefined): "L" | "P" | undefined {
  if (gender === Gender.MALE) return "L";
  if (gender === Gender.FEMALE) return "P";
  return undefined;
}

export function mapUrgency(level: string): CDSSCandidate["urgency"] {
  const key = level.trim().toUpperCase();
  if (key === "HIGH") return "high";
  if (key === "MEDIUM") return "medium";
  return "low";
}

export function mapSmartQueueCandidates(items: SmartQueueCdssCandidate[]): CDSSCandidate[] {
  return items.map((item) => ({
    diagnosis: item.nama_penyakit,
    confidence: Number((item.confidence / 100).toFixed(2)),
    confidencePercent: item.confidence,
    matchedSymptoms: [],
    reasoning: item.penjelasan,
    urgency: mapUrgency(item.tingkat_urgensi),
    recommendedDepartment: item.departemen,
    pemeriksaanLanjutan: item.pemeriksaan_lanjutan ?? [],
  }));
}

function smartQueueBaseUrl(): string | undefined {
  return env.SMARTQUEUE_AI_URL;
}

export async function fetchCdssHealth(): Promise<SmartQueueCdssHealth | null> {
  const base = smartQueueBaseUrl();
  if (!base) return null;

  try {
    const url = new URL("/cdss/health", base);
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    return (await resp.json()) as SmartQueueCdssHealth;
  } catch (err) {
    logger.warn({ err }, "SmartQueue CDSS health check failed");
    return null;
  }
}

export async function fetchCdssRecommend(
  payload: SmartQueueCdssRequest,
): Promise<SmartQueueCdssResponse | null> {
  const base = smartQueueBaseUrl();
  if (!base) return null;

  try {
    const url = new URL("/cdss/recommend", base);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CDSS_TIMEOUT_MS),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "SmartQueue CDSS /recommend failed");
      return null;
    }

    const body = (await resp.json()) as SmartQueueCdssResponse;
    if (body.status !== "success" || !Array.isArray(body.kandidat_diagnosis)) {
      logger.warn({ body }, "SmartQueue CDSS returned unexpected payload");
      return null;
    }

    return body;
  } catch (err) {
    logger.warn({ err }, "SmartQueue CDSS recommend request failed");
    return null;
  }
}

export function isCdssAiAvailable(health: SmartQueueCdssHealth | null): boolean {
  return health?.status === "healthy" && health.gemini_api_configured === true;
}
