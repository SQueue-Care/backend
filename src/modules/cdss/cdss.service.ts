import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ServiceUnavailableError } from "../../utils/errors";
import type { AnalyzeNotesInput, RecommendInput } from "./cdss.schema";
import {
  fetchCdssHealth,
  fetchCdssRecommend,
  isCdssAiAvailable,
  mapGenderToSmartQueue,
} from "./cdss.smartqueue";
import type { CdssHealthResponse, CdssKandidatDiagnosis, CdssRecommendResponse } from "./cdss.types";

const CDSS_ENGINE = "smartqueue-gemini";

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, Math.min(120, age));
}

async function resolvePatientContext(patientId?: string) {
  if (!patientId) {
    return { umur: undefined as number | undefined, jenisKelamin: undefined as "L" | "P" | undefined };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { birthDate: true, gender: true },
  });

  if (!patient) return { umur: undefined, jenisKelamin: undefined };

  return {
    umur: patient.birthDate ? calculateAge(patient.birthDate) : undefined,
    jenisKelamin: mapGenderToSmartQueue(patient.gender ?? undefined),
  };
}

async function persistCdssResult(data: {
  patientId?: string;
  doctorId?: string;
  queueId?: string;
  gejala: string;
  response: {
    gejala_teridentifikasi: string[];
    kandidat_diagnosis: CdssKandidatDiagnosis[];
    catatan_medis: string;
    disclaimer: string;
  };
}): Promise<string> {
  const recordData = {
    patientId: data.patientId ?? null,
    doctorId: data.doctorId ?? null,
    queueId: data.queueId ?? null,
    notes: data.gejala,
    symptoms: data.response.gejala_teridentifikasi as Prisma.InputJsonValue,
    candidates: {
      kandidat_diagnosis: data.response.kandidat_diagnosis,
      catatan_medis: data.response.catatan_medis,
      disclaimer: data.response.disclaimer,
    } as unknown as Prisma.InputJsonValue,
    engine: CDSS_ENGINE,
  };

  return prisma.$transaction(async (tx) => {
    if (data.queueId) {
      await tx.queue.update({
        where: { id: data.queueId },
        data: { notes: data.gejala },
      });

      const existing = await tx.cDSSResult.findFirst({
        where: { queueId: data.queueId },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        const updated = await tx.cDSSResult.update({
          where: { id: existing.id },
          data: recordData,
        });
        return updated.id;
      }
    }

    const saved = await tx.cDSSResult.create({ data: recordData });
    return saved.id;
  });
}

function toRecommendResponse(
  id: string,
  gejala: string,
  ai: {
    gejala_teridentifikasi: string[];
    kandidat_diagnosis: CdssKandidatDiagnosis[];
    catatan_medis: string;
    disclaimer: string;
  },
  extra?: { createdAt?: Date; notes?: string | null; patient?: CdssRecommendResponse["patient"] },
): CdssRecommendResponse {
  return {
    id,
    gejala,
    gejala_teridentifikasi: ai.gejala_teridentifikasi,
    kandidat_diagnosis: ai.kandidat_diagnosis,
    catatan_medis: ai.catatan_medis,
    disclaimer: ai.disclaimer,
    status: "success",
    notes: extra?.notes ?? gejala,
    createdAt: extra?.createdAt,
    patient: extra?.patient,
  };
}

function parseStoredCandidates(candidates: Prisma.JsonValue): {
  kandidat_diagnosis: CdssKandidatDiagnosis[];
  catatan_medis: string;
  disclaimer: string;
} {
  if (Array.isArray(candidates)) {
    return {
      kandidat_diagnosis: candidates as unknown as CdssKandidatDiagnosis[],
      catatan_medis: "",
      disclaimer:
        "Hasil ini merupakan rekomendasi berbasis AI dan BUKAN diagnosis medis. Keputusan klinis tetap sepenuhnya berada di tangan dokter yang menangani.",
    };
  }

  if (candidates && typeof candidates === "object") {
    const obj = candidates as Record<string, unknown>;
    const kandidat = Array.isArray(obj.kandidat_diagnosis)
      ? (obj.kandidat_diagnosis as CdssKandidatDiagnosis[])
      : [];
    return {
      kandidat_diagnosis: kandidat,
      catatan_medis: typeof obj.catatan_medis === "string" ? obj.catatan_medis : "",
      disclaimer:
        typeof obj.disclaimer === "string"
          ? obj.disclaimer
          : "Hasil ini merupakan rekomendasi berbasis AI dan BUKAN diagnosis medis. Keputusan klinis tetap sepenuhnya berada di tangan dokter yang menangani.",
    };
  }

  return {
    kandidat_diagnosis: [],
    catatan_medis: "",
    disclaimer:
      "Hasil ini merupakan rekomendasi berbasis AI dan BUKAN diagnosis medis. Keputusan klinis tetap sepenuhnya berada di tangan dokter yang menangani.",
  };
}

function fromDbRecord(
  record: {
    id: string;
    notes: string | null;
    symptoms: Prisma.JsonValue;
    candidates: Prisma.JsonValue;
    createdAt: Date;
    patient?: CdssRecommendResponse["patient"] | null;
  },
): CdssRecommendResponse {
  const gejala_teridentifikasi = Array.isArray(record.symptoms)
    ? (record.symptoms as string[])
    : [];
  const stored = parseStoredCandidates(record.candidates);

  return {
    id: record.id,
    gejala: record.notes ?? "",
    gejala_teridentifikasi,
    kandidat_diagnosis: stored.kandidat_diagnosis,
    catatan_medis: stored.catatan_medis,
    disclaimer: stored.disclaimer,
    status: "success",
    notes: record.notes,
    createdAt: record.createdAt,
    patient: record.patient ?? undefined,
  };
}

async function callSmartQueueCdss(
  gejala: string,
  context: {
    patientId?: string;
    doctorId: string;
    queueId?: string;
    umur?: number;
    jenis_kelamin?: "L" | "P";
  },
): Promise<CdssRecommendResponse> {
  const patientCtx = await resolvePatientContext(context.patientId);

  const aiResponse = await fetchCdssRecommend({
    gejala,
    umur: context.umur ?? patientCtx.umur,
    jenis_kelamin: context.jenis_kelamin ?? patientCtx.jenisKelamin,
  });

  const id = await persistCdssResult({
    patientId: context.patientId,
    doctorId: context.doctorId,
    queueId: context.queueId,
    gejala,
    response: aiResponse,
  });

  return toRecommendResponse(id, gejala, aiResponse);
}

/** Selaras SmartQueue GET /cdss/health */
export async function getCdssHealth(): Promise<CdssHealthResponse> {
  if (!env.SMARTQUEUE_AI_URL) {
    return {
      status: "not_configured",
      gemini_api_configured: false,
      message: "SMARTQUEUE_AI_URL belum dikonfigurasi",
    };
  }

  const health = await fetchCdssHealth();
  if (!health) {
    return {
      status: "unreachable",
      gemini_api_configured: false,
      message: "Layanan SmartQueue AI tidak dapat dijangkau",
    };
  }

  return health;
}

/** Alias untuk kompatibilitas endpoint /cdss/ai-status */
export async function getAiStatus(): Promise<CdssHealthResponse & { available: boolean }> {
  const health = await getCdssHealth();
  return {
    ...health,
    available: isCdssAiAvailable(health),
  };
}

export async function recommend(
  input: RecommendInput & { doctorId: string },
): Promise<CdssRecommendResponse> {
  if (!isCdssAiAvailable(await getCdssHealth())) {
    throw new ServiceUnavailableError(
      "CDSS tidak tersedia. Pastikan SmartQueue AI aktif dan GEMINI_API_KEY terkonfigurasi.",
    );
  }

  return callSmartQueueCdss(input.gejala, {
    patientId: input.patientId,
    doctorId: input.doctorId,
    queueId: input.queueId,
    umur: input.umur,
    jenis_kelamin: input.jenis_kelamin,
  });
}

export async function analyzeNotes(
  input: AnalyzeNotesInput & { doctorId: string },
): Promise<CdssRecommendResponse> {
  return recommend({
    gejala: input.notes.trim(),
    patientId: input.patientId,
    queueId: input.queueId,
    doctorId: input.doctorId,
  });
}

export async function listSymptoms() {
  return prisma.symptom.findMany({ orderBy: { label: "asc" } });
}

export async function historyForPatient(patientId: string): Promise<CdssRecommendResponse[]> {
  const rows = await prisma.cDSSResult.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map(fromDbRecord);
}

export async function findLatestResult(doctorId: string): Promise<CdssRecommendResponse | null> {
  const row = await prisma.cDSSResult.findFirst({
    where: { doctorId },
    orderBy: { createdAt: "desc" },
  });
  return row ? fromDbRecord(row) : null;
}

export async function listResultsByDoctor(
  doctorId: string,
  limit = 20,
): Promise<CdssRecommendResponse[]> {
  const rows = await prisma.cDSSResult.findMany({
    where: { doctorId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  });
  return rows.map(fromDbRecord);
}

export async function findByQueueId(queueId: string): Promise<CdssRecommendResponse | null> {
  const row = await prisma.cDSSResult.findFirst({
    where: { queueId },
    orderBy: { createdAt: "desc" },
  });
  return row ? fromDbRecord(row) : null;
}
