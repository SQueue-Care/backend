import { QueueStatus } from "@prisma/client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../config/prisma";
import type { WaitTimeQuery } from "./predictions.schema";

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  source: "ml" | "heuristic";
  modelVersion?: string;
  waitingAhead: number;
  avgServiceMinutes: number;
}

const DEFAULT_AVG_SERVICE_MIN = 10;

/**
 * Heuristik sederhana ketika ML service tidak tersedia:
 *   ETA = waitingAhead * avgServiceMin(dokter terkait) + inProgressBuffer
 */
async function heuristicEstimate(query: WaitTimeQuery): Promise<WaitTimeEstimate> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

async function mlEstimate(query: WaitTimeQuery): Promise<WaitTimeEstimate | null> {
  if (!env.ML_SERVICE_URL) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    console.log(`[DEBUG ML] Found ${activeQueues.length} active queues (WAITING=${activeQueues.filter(q => q.status === QueueStatus.WAITING).length}) for dept=${query.departmentId.substring(0, 12)}, doctor=${query.doctorId?.substring(0, 12)}, date=${today.toISOString().split('T')[0]}`);
    const avgService =
      activeQueues.find((q) => q.doctor)?.doctor?.avgServiceMin ??
      (query.doctorId
        ? ((await prisma.doctor.findUnique({ where: { id: query.doctorId } }))?.avgServiceMin ??
          DEFAULT_AVG_SERVICE_MIN)
        : DEFAULT_AVG_SERVICE_MIN);

    const url = new URL("/predict/wait-time", env.ML_SERVICE_URL);
    url.searchParams.set("departmentId", query.departmentId);
    url.searchParams.set("waitingAhead", String(waitingAhead));
    url.searchParams.set("avgServiceMinutes", String(avgService));

    console.log(`[ML] Calling ${url.toString()}`);
    const resp = await fetch(url, {
      method: "GET",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error(`ML service responded ${resp.status}`);
    const body = (await resp.json()) as {
      estimatedMinutes: number;
      modelVersion?: string;
      waitingAhead?: number;
      avgServiceMinutes?: number;
    };
    console.log(`[ML] Response:`, body);
    return {
      estimatedMinutes: Math.max(0, Math.round(body.estimatedMinutes)),
      source: "ml",
      modelVersion: body.modelVersion,
      waitingAhead: waitingAhead,
      avgServiceMinutes: avgService,
    };
  } catch (err) {
    console.log(`[ML] Error:`, err);
    logger.warn({ err }, "ML service failed, falling back to heuristic");
    return null;
  }
}

export async function estimateWaitTime(query: WaitTimeQuery): Promise<WaitTimeEstimate> {
  console.log(`[ESTIMATE] Starting for dept=${query.departmentId}, doctor=${query.doctorId}`);
  const ml = await mlEstimate(query);
  if (ml) {
    console.log(`[ESTIMATE] Using ML: ${ml.estimatedMinutes} min`);
    return ml;
  }
  const heuristic = await heuristicEstimate(query);
  console.log(`[ESTIMATE] Using heuristic: ${heuristic.estimatedMinutes} min`);
  return heuristic;
}
