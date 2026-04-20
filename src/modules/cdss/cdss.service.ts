import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ruleBasedEngine } from "./cdss.engine";
import type { RecommendInput } from "./cdss.schema";
import type { CDSSEngine } from "./cdss.types";

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
