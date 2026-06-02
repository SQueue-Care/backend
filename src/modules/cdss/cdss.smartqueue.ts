import { Gender } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ServiceUnavailableError } from "../../utils/errors";
import type { CdssHealthResponse, CdssKandidatDiagnosis } from "./cdss.types";

const CDSS_TIMEOUT_MS = 30_000;

export interface SmartQueueCdssRequest {
  gejala: string;
  umur?: number;
  jenis_kelamin?: "L" | "P";
}

export interface SmartQueueCdssResponse {
  gejala_teridentifikasi: string[];
  kandidat_diagnosis: CdssKandidatDiagnosis[];
  catatan_medis: string;
  disclaimer: string;
  status: string;
}

export type SmartQueueCdssHealth = CdssHealthResponse;

export function mapGenderToSmartQueue(gender: Gender | null | undefined): "L" | "P" | undefined {
  if (gender === Gender.MALE) return "L";
  if (gender === Gender.FEMALE) return "P";
  return undefined;
}

function smartQueueBaseUrl(): string | undefined {
  return env.ML_SERVICE_URL;
}

async function parseErrorDetail(resp: Response): Promise<string | undefined> {
  try {
    const body = (await resp.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((item) => item.msg).filter(Boolean).join("; ");
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

export async function fetchCdssHealth(): Promise<CdssHealthResponse | null> {
  const base = smartQueueBaseUrl();
  if (!base) return null;

  try {
    const url = new URL("/cdss/health", base);
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    return (await resp.json()) as CdssHealthResponse;
  } catch (err) {
    logger.warn({ err }, "SmartQueue CDSS health check failed");
    return null;
  }
}

export async function fetchCdssRecommend(
  payload: SmartQueueCdssRequest,
): Promise<SmartQueueCdssResponse> {
  const base = smartQueueBaseUrl();
  if (!base) {
    throw new ServiceUnavailableError("ML_SERVICE_URL belum dikonfigurasi");
  }

  try {
    const url = new URL("/cdss/recommend", base);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CDSS_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const detail = await parseErrorDetail(resp);
      throw new ServiceUnavailableError(
        detail ?? `SmartQueue CDSS /recommend gagal (${resp.status})`,
      );
    }

    const body = (await resp.json()) as SmartQueueCdssResponse;
    if (body.status !== "success" || !Array.isArray(body.kandidat_diagnosis)) {
      throw new ServiceUnavailableError("SmartQueue CDSS mengembalikan respons tidak valid");
    }

    return body;
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    logger.warn({ err }, "SmartQueue CDSS recommend request failed");
    throw new ServiceUnavailableError("Layanan SmartQueue CDSS tidak dapat dijangkau");
  }
}

export function isCdssAiAvailable(health: CdssHealthResponse | null): boolean {
  return health?.status === "healthy" && health.gemini_api_configured === true;
}
