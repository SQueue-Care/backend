import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { BadRequestError, ServiceUnavailableError } from "../../utils/errors";
import { ruleBasedEngine } from "./cdss.engine";
import type { AnalyzeNotesInput, RecommendInput } from "./cdss.schema";
import {
  fetchCdssHealth,
  fetchCdssRecommend,
  isCdssAiAvailable,
  mapGenderToSmartQueue,
  mapSmartQueueCandidates,
  type SmartQueueCdssHealth,
} from "./cdss.smartqueue";
import type { CDSSCandidate, RecommendResult } from "./cdss.types";

const GEMINI_ENGINE = "smartqueue-gemini";
const GEMINI_VERSION = "gemini-2.5-flash";
const RULE_DISCLAIMER =
  "Hasil ini adalah rekomendasi awal berbasis aturan dan bukan diagnosis final. Keputusan medis tetap pada dokter.";

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
  if (!patientId) return { umur: undefined as number | undefined, jenisKelamin: undefined as "L" | "P" | undefined };

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

async function resolveSymptomLabels(codes: string[]): Promise<string[]> {
  const normalized = codes.map((c) => c.trim().toLowerCase());
  const rows = await prisma.symptom.findMany({
    where: { code: { in: normalized } },
    select: { code: true, label: true },
  });
  const labelByCode = new Map(rows.map((r) => [r.code, r.label]));

  return codes.map((code) => {
    const key = code.trim().toLowerCase();
    return labelByCode.get(key) ?? code;
  });
}

async function buildGejalaText(input: RecommendInput | { gejala?: string; symptoms?: string[] }): Promise<string> {
  if (input.gejala?.trim()) return input.gejala.trim();
  if (input.symptoms?.length) {
    const labels = await resolveSymptomLabels(input.symptoms);
    return labels.join(", ");
  }
  throw new BadRequestError("Gejala wajib diisi");
}

async function persistCdssResult(data: {
  patientId?: string;
  doctorId?: string;
  queueId?: string;
  notes?: string;
  symptoms: string[] | Prisma.InputJsonValue;
  candidates: CDSSCandidate[];
  engine: string;
}): Promise<string> {
  const saved = await prisma.cDSSResult.create({
    data: {
      patientId: data.patientId ?? null,
      doctorId: data.doctorId ?? null,
      queueId: data.queueId ?? null,
      notes: data.notes ?? null,
      symptoms: data.symptoms as Prisma.InputJsonValue,
      candidates: data.candidates as unknown as Prisma.InputJsonValue,
      engine: data.engine,
    },
  });
  return saved.id;
}

async function recommendViaGemini(
  gejala: string,
  context: { patientId?: string; doctorId?: string; queueId?: string; notes?: string },
): Promise<RecommendResult | null> {
  const { umur, jenisKelamin } = await resolvePatientContext(context.patientId);

  const aiResponse = await fetchCdssRecommend({
    gejala,
    umur,
    jenis_kelamin: jenisKelamin,
  });

  if (!aiResponse) return null;

  const candidates = mapSmartQueueCandidates(aiResponse.kandidat_diagnosis);
  const id = await persistCdssResult({
    patientId: context.patientId,
    doctorId: context.doctorId,
    queueId: context.queueId,
    notes: context.notes,
    symptoms: aiResponse.gejala_teridentifikasi,
    candidates,
    engine: GEMINI_ENGINE,
  });

  return {
    id,
    engine: GEMINI_ENGINE,
    source: "gemini",
    version: GEMINI_VERSION,
    disclaimer: aiResponse.disclaimer,
    identifiedSymptoms: aiResponse.gejala_teridentifikasi,
    catatanMedis: aiResponse.catatan_medis,
    candidates,
  };
}

async function recommendViaRules(
  symptoms: string[],
  context: { patientId?: string; doctorId?: string; queueId?: string },
): Promise<RecommendResult> {
  const candidates = await ruleBasedEngine.recommend({
    symptoms,
    patientId: context.patientId,
    doctorId: context.doctorId,
  });

  const id = await persistCdssResult({
    patientId: context.patientId,
    doctorId: context.doctorId,
    queueId: context.queueId,
    symptoms,
    candidates,
    engine: ruleBasedEngine.name,
  });

  return {
    id,
    engine: ruleBasedEngine.name,
    source: "rule-based",
    version: ruleBasedEngine.version,
    disclaimer: RULE_DISCLAIMER,
    candidates,
  };
}

export async function getAiStatus(): Promise<{
  configured: boolean;
  available: boolean;
  status: string;
  message: string;
}> {
  if (!env.SMARTQUEUE_AI_URL) {
    return {
      configured: false,
      available: false,
      status: "not_configured",
      message: "SMARTQUEUE_AI_URL belum dikonfigurasi",
    };
  }

  const health = await fetchCdssHealth();
  if (!health) {
    return {
      configured: true,
      available: false,
      status: "unreachable",
      message: "Layanan SmartQueue AI tidak dapat dijangkau",
    };
  }

  return {
    configured: true,
    available: isCdssAiAvailable(health),
    status: health.status,
    message: health.message,
  };
}

export async function recommend(
  input: RecommendInput & { doctorId: string },
): Promise<RecommendResult> {
  const gejala = await buildGejalaText(input);
  const context = {
    patientId: input.patientId,
    doctorId: input.doctorId,
    queueId: input.queueId,
  };

  const geminiResult = await recommendViaGemini(gejala, context);
  if (geminiResult) return geminiResult;

  if (input.symptoms?.length) {
    logger.info("SmartQueue CDSS unavailable, using rule-based fallback");
    return recommendViaRules(input.symptoms, context);
  }

  throw new ServiceUnavailableError(
    "Layanan rekomendasi AI tidak tersedia. Coba lagi nanti atau gunakan checklist gejala.",
  );
}

export async function listSymptoms() {
  return prisma.symptom.findMany({ orderBy: { label: "asc" } });
}

export async function historyForPatient(patientId: string) {
  return prisma.cDSSResult.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function findLatestResult(doctorId: string) {
  return prisma.cDSSResult.findFirst({
    where: { doctorId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listResultsByDoctor(doctorId: string, limit = 20) {
  return prisma.cDSSResult.findMany({
    where: { doctorId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  });
}

export async function findByQueueId(queueId: string) {
  return prisma.cDSSResult.findFirst({
    where: { queueId },
    orderBy: { createdAt: "desc" },
  });
}

export async function analyzeNotes(
  input: AnalyzeNotesInput & { doctorId: string },
): Promise<RecommendResult> {
  const geminiResult = await recommendViaGemini(input.notes.trim(), {
    patientId: input.patientId,
    doctorId: input.doctorId,
    queueId: input.queueId,
    notes: input.notes,
  });

  if (geminiResult) return geminiResult;

  if (env.LLM_API_BASE_URL) {
    return analyzeNotesLegacyLlm(input);
  }

  throw new ServiceUnavailableError(
    "Layanan analisis catatan AI tidak tersedia. Pastikan SmartQueue AI aktif atau konfigurasi LLM_API_BASE_URL.",
  );
}

async function analyzeNotesLegacyLlm(
  input: AnalyzeNotesInput & { doctorId: string },
): Promise<RecommendResult> {
  const apiUrl = env.LLM_API_BASE_URL!;
  const model = env.LLM_MODEL ?? "default";

  const systemPrompt = `Kamu adalah asisten medis. Analisis catatan klinis pasien dan berikan output HANYA dalam format JSON berikut tanpa teks lain:
{
  "symptoms": ["gejala1", "gejala2"],
  "candidates": [
    {
      "diagnosis": "nama diagnosis",
      "confidence": 0.8,
      "reasoning": "penjelasan singkat",
      "urgency": "low",
      "recommendedDepartment": "UMUM"
    }
  ]
}
urgency: low | medium | high. Maks 5 kandidat diagnosis.`;

  const resp = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Catatan pasien: ${input.notes}` },
      ],
      temperature: 0.3,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new ServiceUnavailableError(`Layanan LLM gagal (${resp.status})`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  let parsed: { symptoms: string[]; candidates: CDSSCandidate[] };
  try {
    if (!json.choices?.[0]?.message?.content) {
      throw new Error("Invalid LLM response format");
    }
    parsed = JSON.parse(json.choices[0].message.content);
  } catch (err) {
    throw new ServiceUnavailableError(
      `Gagal memproses respons LLM: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }

  const candidates = parsed.candidates.map((c) => ({
    ...c,
    matchedSymptoms: c.matchedSymptoms ?? [],
  }));

  const id = await persistCdssResult({
    patientId: input.patientId,
    doctorId: input.doctorId,
    queueId: input.queueId,
    notes: input.notes,
    symptoms: parsed.symptoms,
    candidates,
    engine: "legacy-llm",
  });

  return {
    id,
    engine: "legacy-llm",
    source: "legacy-llm",
    disclaimer:
      "Hasil ini adalah rekomendasi awal berbasis AI dan bukan diagnosis final. Keputusan medis tetap pada dokter.",
    identifiedSymptoms: parsed.symptoms,
    candidates,
  };
}
