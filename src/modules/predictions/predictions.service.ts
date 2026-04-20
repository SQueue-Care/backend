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
    const url = new URL("/predict/wait-time", env.ML_SERVICE_URL);
    url.searchParams.set("departmentId", query.departmentId);
    if (query.scheduleId) url.searchParams.set("scheduleId", query.scheduleId);
    if (query.doctorId) url.searchParams.set("doctorId", query.doctorId);

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
    return {
      estimatedMinutes: Math.max(0, Math.round(body.estimatedMinutes)),
      source: "ml",
      modelVersion: body.modelVersion,
      waitingAhead: body.waitingAhead ?? 0,
      avgServiceMinutes: body.avgServiceMinutes ?? DEFAULT_AVG_SERVICE_MIN,
    };
  } catch (err) {
    logger.warn({ err }, "ML service failed, falling back to heuristic");
    return null;
  }
}

export async function estimateWaitTime(query: WaitTimeQuery): Promise<WaitTimeEstimate> {
  const ml = await mlEstimate(query);
  if (ml) return ml;
  return heuristicEstimate(query);
}
