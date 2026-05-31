import { PatientType, QueuePriority, QueueStatus } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { mapDepartmentName } from "./department-name-mapper";
import type { WaitTimeQuery } from "./predictions.schema";

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  source: "ml" | "heuristic";
  modelVersion?: string;
  kategori?: string;
  waitingAhead: number;
  avgServiceMinutes: number;
}

const DEFAULT_AVG_SERVICE_MIN = 10;

/** Maps internal QueuePriority enum to the prioritas string expected by FastAPI */
function mapPriority(priority?: QueuePriority): string {
  const map: Record<QueuePriority, string> = {
    DARURAT: "Darurat",
    TINGGI: "Tinggi",
    URGENT: "Urgent",
    SEDANG: "Sedang",
    NORMAL: "Normal",
    RENDAH: "Rendah",
  };
  return map[priority ?? QueuePriority.NORMAL];
}

/** Maps internal PatientType enum to the status_pasien string expected by FastAPI */
function mapPatientType(patientType?: PatientType): string {
  if (patientType === PatientType.RAWAT_INAP) return "Rawat Inap";
  return "Rawat Jalan";
}

/** Calculates age in years from a birth date */
function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(1, age);
}

/** Formats a Date to YYYY-MM-DD string */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

/** Returns today's date string in WIB timezone */
function getWibDateString(date?: Date): string {
  const base = date ?? new Date();
  const utc = base.getTime() + base.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 3600000 * 7);
  return wib.toISOString().split("T")[0] ?? "";
}

/**
 * Heuristic estimate when the AI service is unavailable.
 * ETA = waitingAhead × avgServiceMin + inProgressBuffer
 */
async function heuristicEstimate(query: WaitTimeQuery): Promise<WaitTimeEstimate> {
  const wibDateString = getWibDateString();
  const today = new Date(`${wibDateString}T12:00:00.000Z`);

  const activeQueues = await prisma.queue.findMany({
    where: {
      departmentId: query.departmentId,
      doctorId: query.doctorId,
      queueDate: today,
      status: { in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_PROGRESS] },
    },
    include: { doctor: { select: { avgServiceMin: true } } },
    orderBy: { queueNumber: "asc" },
  });

  const waitingAhead = activeQueues.filter((q) => q.status === QueueStatus.WAITING).length;

  const avgService =
    activeQueues.find((q) => q.doctor)?.doctor?.avgServiceMin ??
    (query.doctorId
      ? ((await prisma.doctor.findUnique({ where: { id: query.doctorId } }))?.avgServiceMin ??
        DEFAULT_AVG_SERVICE_MIN)
      : DEFAULT_AVG_SERVICE_MIN);

  const inProgress = activeQueues.find((q) => q.status === QueueStatus.IN_PROGRESS);
  const inProgressBuffer = inProgress ? Math.ceil(avgService / 2) : 0;
  const estimatedMinutes = waitingAhead * avgService + inProgressBuffer;

  return {
    estimatedMinutes,
    source: "heuristic",
    waitingAhead,
    avgServiceMinutes: avgService,
  };
}

/**
 * AI-based estimate using the SmartQueue FastAPI service.
 * Sends full patient + queue context to the Deep Learning model.
 * Returns null on failure so the caller falls back to heuristic.
 */
async function mlEstimate(query: WaitTimeQuery): Promise<WaitTimeEstimate | null> {
  if (!env.SMARTQUEUE_AI_URL) return null;

  try {
    const wibDateString = getWibDateString(query.queueDate);
    const today = new Date(`${wibDateString}T12:00:00.000Z`);

    // Count active queues for jumlah_antrian and avgService
    const activeQueues = await prisma.queue.findMany({
      where: {
        departmentId: query.departmentId,
        doctorId: query.doctorId,
        queueDate: today,
        status: { in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_PROGRESS] },
      },
      include: { doctor: { select: { avgServiceMin: true } } },
    });

    const waitingAhead = activeQueues.filter((q) => q.status === QueueStatus.WAITING).length;
    const avgService =
      activeQueues.find((q) => q.doctor)?.doctor?.avgServiceMin ??
      (query.doctorId
        ? ((await prisma.doctor.findUnique({ where: { id: query.doctorId } }))?.avgServiceMin ??
          DEFAULT_AVG_SERVICE_MIN)
        : DEFAULT_AVG_SERVICE_MIN);

    // Fetch department name for nama_poli mapping
    const department = await prisma.department.findUnique({
      where: { id: query.departmentId },
      select: { name: true },
    });

    // Fetch patient data for umur and asuransi
    let umur = 30; // sensible default
    let asuransi = "Umum";
    if (query.patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: query.patientId },
        select: { birthDate: true, bpjsNumber: true },
      });
      if (patient?.birthDate) {
        umur = calculateAge(patient.birthDate);
      }
      if (patient?.bpjsNumber) {
        asuransi = "BPJS";
      }
    }

    const payload = {
      umur,
      jumlah_antrian: waitingAhead,
      jam_kedatangan: query.arrivalHour ?? new Date().getHours(),
      asuransi,
      prioritas: mapPriority(query.priority),
      status_pasien: mapPatientType(query.patientType),
      nama_poli: mapDepartmentName(department?.name ?? ""),
      tanggal: formatDate(today),
    };

    logger.debug({ payload }, "Calling SmartQueue AI /predict");

    const url = new URL("/predict", env.SMARTQUEUE_AI_URL);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) throw new Error(`SmartQueue AI responded ${resp.status}`);

    const body = (await resp.json()) as {
      predicted_waiting_time_minutes: number;
      kategori_waktu_tunggu?: string;
      status?: string;
    };

    return {
      estimatedMinutes: Math.max(0, Math.round(body.predicted_waiting_time_minutes)),
      source: "ml",
      modelVersion: "smartqueue-deeplearning-v4",
      kategori: body.kategori_waktu_tunggu,
      waitingAhead,
      avgServiceMinutes: avgService,
    };
  } catch (err) {
    logger.warn({ err }, "SmartQueue AI service failed, falling back to heuristic");
    return null;
  }
}

export async function estimateWaitTime(query: WaitTimeQuery): Promise<WaitTimeEstimate> {
  const ml = await mlEstimate(query);
  if (ml) return ml;
  return heuristicEstimate(query);
}
