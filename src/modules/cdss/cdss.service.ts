import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ruleBasedEngine } from "./cdss.engine";
import type { RecommendInput } from "./cdss.schema";
import type { CDSSEngine, CDSSCandidate } from "./cdss.types";

const activeEngine: CDSSEngine = ruleBasedEngine;

export async function recommend(input: RecommendInput) {
  const candidates = await activeEngine.recommend({
    symptoms: input.symptoms,
    patientId: input.patientId,
    doctorId: input.doctorId,
  });

  const saved = await prisma.cDSSResult.create({
    data: {
      patientId: input.patientId ?? null,
      doctorId: input.doctorId ?? null,
      symptoms: input.symptoms,
      candidates: candidates as unknown as Prisma.InputJsonValue,
      engine: activeEngine.name,
    },
  });

  return {
    id: saved.id,
    engine: activeEngine.name,
    version: activeEngine.version,
    disclaimer:
      "Hasil ini adalah rekomendasi awal berbasis aturan dan bukan diagnosis final. Keputusan medis tetap pada dokter.",
    candidates,
  };
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

export async function analyzeNotes(input: {
  notes: string;
  patientId?: string;
  doctorId?: string;
  queueId?: string;
}) {
  if (!env.LLM_API_BASE_URL) {
    throw new Error("LLM service not configured");
  }

  const apiUrl = env.LLM_API_BASE_URL;
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
    throw new Error(`LLM API error: ${resp.status}`);
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
    throw new Error(`Failed to parse LLM response: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  const saved = await prisma.cDSSResult.create({
    data: {
      patientId: input.patientId ?? null,
      doctorId: input.doctorId ?? null,
      queueId: input.queueId ?? null,
      notes: input.notes,
      symptoms: parsed.symptoms,
      candidates: parsed.candidates as unknown as Prisma.InputJsonValue,
      engine: "hermes-llm",
    },
  });

  return {
    id: saved.id,
    symptoms: parsed.symptoms,
    candidates: parsed.candidates,
    engine: "hermes-llm",
    disclaimer:
      "Hasil ini adalah rekomendasi awal berbasis AI dan bukan diagnosis final. Keputusan medis tetap pada dokter.",
  };
}
