import { QueuePriority, QueueStatus } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import { resolveEffectiveArrivalHour, resolveSessionMetaFromSchedule } from "../queues/session-time";
import { mapDepartmentName } from "./department-name-mapper";
import type { WaitTimeQuery } from "./predictions.schema";

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  source: "ml" | "heuristic";
  modelVersion?: string;
  kategori?: string;
  waitingAhead: number;
  avgServiceMinutes: number;
  sessionStartAt?: string;
  estimatedCallAt?: string;
  sessionStartTime?: string;
}

const DEFAULT_AVG_SERVICE_MIN = 10;

/** Maps internal QueuePriority to SmartQueue API prioritas: "normal" | "urgent" */
function mapPriority(priority?: QueuePriority): "normal" | "urgent" {
  switch (priority) {
    case QueuePriority.DARURAT:
    case QueuePriority.TINGGI:
    case QueuePriority.URGENT:
      return "urgent";
    default:
      return "normal";
  }
}

/** Maps insurance to SmartQueue API asuransi: "bpjs" | "umum" */
function mapAsuransi(hasBpjs: boolean): "bpjs" | "umum" {
  return hasBpjs ? "bpjs" : "umum";
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
  const wibDateString = getWibDateString(query.queueDate);
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

async function resolveArrivalHour(query: WaitTimeQuery): Promise<number> {
  if (query.arrivalHour != null) return query.arrivalHour;

  const referenceNow = new Date();
  const queueDate = query.queueDate
    ? new Date(`${getWibDateString(query.queueDate)}T12:00:00.000Z`)
    : new Date(`${getWibDateString()}T12:00:00.000Z`);

  if (query.scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: query.scheduleId },
      select: { startTime: true },
    });
    if (schedule?.startTime) {
      return resolveEffectiveArrivalHour(queueDate, schedule.startTime, referenceNow);
    }
  }

  return resolveEffectiveArrivalHour(queueDate, null, referenceNow);
}

async function attachSessionMeta(
  query: WaitTimeQuery,
  estimate: Omit<WaitTimeEstimate, "sessionStartAt" | "estimatedCallAt" | "sessionStartTime">,
): Promise<WaitTimeEstimate> {
  let startTime: string | null = null;
  if (query.scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: query.scheduleId },
      select: { startTime: true },
    });
    startTime = schedule?.startTime ?? null;
  }

  const queueDate = query.queueDate
    ? new Date(`${getWibDateString(query.queueDate)}T12:00:00.000Z`)
    : undefined;

  return {
    ...estimate,
    ...resolveSessionMetaFromSchedule(queueDate, startTime, estimate.estimatedMinutes, new Date()),
  };
}

/**
 * AI-based estimate using the SmartQueue FastAPI service.
 * Sends full patient + queue context to the Deep Learning model.
 * Returns null on failure so the caller falls back to heuristic.
 */
async function mlEstimate(query: WaitTimeQuery): Promise<WaitTimeEstimate | null> {
  if (!env.ML_SERVICE_URL) return null;

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
    let hasBpjs = false;
    if (query.patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: query.patientId },
        select: { birthDate: true, bpjsNumber: true },
      });
      if (patient?.birthDate) {
        umur = calculateAge(patient.birthDate);
      }
      hasBpjs = Boolean(patient?.bpjsNumber);
    }

    const arrivalHour = await resolveArrivalHour(query);

    const payload = {
      umur,
      jumlah_antrian: waitingAhead,
      jam_kedatangan: arrivalHour,
      asuransi: mapAsuransi(hasBpjs),
      prioritas: mapPriority(query.priority),
      nama_poli: mapDepartmentName(department?.name ?? ""),
      tanggal: formatDate(today),
    };

    logger.debug({ payload }, "Calling SmartQueue AI /predict/");

    const url = new URL("/predict/", env.ML_SERVICE_URL);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.ML_SERVICE_TIMEOUT_MS),
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
      modelVersion: "smartqueue-deeplearning-v5",
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
  if (ml) return attachSessionMeta(query, ml);
  const heuristic = await heuristicEstimate(query);
  return attachSessionMeta(query, heuristic);
}
