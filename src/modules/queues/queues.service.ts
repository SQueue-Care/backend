import { QueueStatus, Role, type Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { estimateWaitTime } from "../predictions/predictions.service";
import type { CreateQueueInput, ListQueuesQuery, UpdateQueueStatusInput } from "./queues.schema";

const QUEUE_INCLUDE = {
  patient: { include: { user: { select: { id: true, name: true, email: true } } } },
  doctor: { include: { user: { select: { id: true, name: true } } } },
  department: true,
  prediction: true,
} satisfies Prisma.QueueInclude;

function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function nextQueueNumber(departmentId: string, date: Date): Promise<number> {
  const last = await prisma.queue.findFirst({
    where: { departmentId, queueDate: date },
    orderBy: { queueNumber: "desc" },
    select: { queueNumber: true },
  });
  return (last?.queueNumber ?? 0) + 1;
}

export async function createQueue(input: CreateQueueInput, actor: Express.UserPayload) {
  let patientId = input.patientId;
  if (!patientId) {
    if (actor.role !== Role.PATIENT) {
      throw new BadRequestError("patientId wajib diisi jika bukan pasien");
    }
    const patient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (!patient) throw new NotFoundError("Profil pasien tidak ditemukan");
    patientId = patient.id;
  } else if (actor.role === Role.PATIENT) {
    const ownPatient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (ownPatient?.id !== patientId) {
      throw new ForbiddenError("Tidak dapat membuat antrian untuk pasien lain");
    }
  }

  const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
  if (!department) throw new NotFoundError("Department not found");

  const today = startOfDay();

  const duplicate = await prisma.queue.findFirst({
    where: {
      patientId,
      departmentId: input.departmentId,
      queueDate: today,
      status: { in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_PROGRESS] },
    },
  });
  if (duplicate) {
    throw new BadRequestError("Pasien sudah memiliki antrian aktif di poli ini hari ini");
  }

  const queueNumber = await nextQueueNumber(input.departmentId, today);

  const estimate = await estimateWaitTime({
    departmentId: input.departmentId,
    doctorId: input.doctorId,
    scheduleId: input.scheduleId,
  });

  const queue = await prisma.queue.create({
    data: {
      patientId,
      departmentId: input.departmentId,
      doctorId: input.doctorId,
      scheduleId: input.scheduleId,
      queueNumber,
      queueDate: today,
      estimatedWaitMinutes: estimate.estimatedMinutes,
      notes: input.notes,
      prediction: {
        create: {
          estimatedMin: estimate.estimatedMinutes,
          source: estimate.source,
          modelVersion: estimate.modelVersion,
          features: {
            waitingAhead: estimate.waitingAhead,
            avgServiceMinutes: estimate.avgServiceMinutes,
          },
        },
      },
    },
    include: QUEUE_INCLUDE,
  });

  // Decrement schedule capacity
  if (input.scheduleId) {
    await prisma.schedule.update({
      where: { id: input.scheduleId },
      data: { capacity: { decrement: 1 } }
    });
  }

  return queue;
}

export async function getQueue(id: string) {
  const queue = await prisma.queue.findUnique({ where: { id }, include: QUEUE_INCLUDE });
  if (!queue) throw new NotFoundError("Queue not found");
  return queue;
}

export async function listQueues(filters: ListQueuesQuery) {
  const where: Prisma.QueueWhereInput = {
    departmentId: filters.departmentId,
    doctorId: filters.doctorId,
    patientId: filters.patientId,
    status: filters.status,
    queueDate: filters.date ? startOfDay(filters.date) : undefined,
  };
  return prisma.queue.findMany({
    where,
    orderBy: [{ queueDate: "desc" }, { queueNumber: "asc" }],
    include: QUEUE_INCLUDE,
  });
}

const VALID_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: [QueueStatus.CALLED, QueueStatus.SKIPPED, QueueStatus.CANCELLED],
  CALLED: [
    QueueStatus.IN_PROGRESS,
    QueueStatus.SKIPPED,
    QueueStatus.CANCELLED,
    QueueStatus.WAITING,
  ],
  IN_PROGRESS: [QueueStatus.DONE, QueueStatus.SKIPPED],
  DONE: [],
  SKIPPED: [QueueStatus.WAITING],
  CANCELLED: [],
};

export async function updateQueueStatus(
  id: string,
  input: UpdateQueueStatusInput,
  _actor: Express.UserPayload,
) {
  const queue = await prisma.queue.findUnique({ where: { id } });
  if (!queue) throw new NotFoundError("Queue not found");

  const allowed = VALID_TRANSITIONS[queue.status];
  if (!allowed.includes(input.status)) {
    throw new BadRequestError(
      `Transisi dari ${queue.status} ke ${input.status} tidak diperbolehkan`,
    );
  }

  const now = new Date();
  const data: Prisma.QueueUpdateInput = {
    status: input.status,
    notes: input.notes ?? queue.notes,
  };

  if (input.status === QueueStatus.CALLED) data.calledAt = now;
  if (input.status === QueueStatus.IN_PROGRESS) data.startedAt = now;
  if (input.status === QueueStatus.DONE) {
    data.finishedAt = now;
    if (queue.startedAt) {
      data.actualWaitMinutes = Math.max(
        0,
        Math.round((queue.startedAt.getTime() - queue.checkInAt.getTime()) / 60_000),
      );
    }
  }
  if (input.status === QueueStatus.CANCELLED) data.cancelledAt = now;

  const updated = await prisma.queue.update({ where: { id }, data, include: QUEUE_INCLUDE });

  // Increment schedule capacity when queue status changes to CANCELLED
  if (input.status === QueueStatus.CANCELLED && queue.status !== QueueStatus.CANCELLED && queue.scheduleId) {
    await prisma.schedule.update({
      where: { id: queue.scheduleId },
      data: { capacity: { increment: 1 } }
    });
  }

  return updated;
}

export async function cancelQueue(id: string, actor: Express.UserPayload) {
  const queue = await prisma.queue.findUnique({ where: { id }, include: { patient: true } });
  if (!queue) throw new NotFoundError("Queue not found");

  if (actor.role === Role.PATIENT) {
    const ownPatient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (ownPatient?.id !== queue.patientId) {
      throw new ForbiddenError("Tidak dapat membatalkan antrian milik pasien lain");
    }
  }

  if (queue.status === QueueStatus.DONE || queue.status === QueueStatus.CANCELLED) {
    throw new BadRequestError("Antrian sudah tidak aktif");
  }

  const updated = await prisma.queue.update({
    where: { id },
    data: { status: QueueStatus.CANCELLED, cancelledAt: new Date() },
    include: QUEUE_INCLUDE,
  });

  // Increment schedule capacity when queue is cancelled
  if (queue.scheduleId) {
    await prisma.schedule.update({
      where: { id: queue.scheduleId },
      data: { capacity: { increment: 1 } }
    });
  }

  return updated;
}

export async function overviewStats(date?: Date) {
  const target = startOfDay(date ?? new Date());
  const byDept = await prisma.queue.groupBy({
    by: ["departmentId", "status"],
    where: { queueDate: target },
    _count: { _all: true },
  });

  const departments = await prisma.department.findMany();
  const deptIndex = new Map(departments.map((d) => [d.id, d]));

  const result: Record<
    string,
    {
      departmentId: string;
      code: string;
      name: string;
      counts: Partial<Record<QueueStatus, number>>;
      total: number;
    }
  > = {};

  for (const row of byDept) {
    const dept = deptIndex.get(row.departmentId);
    if (!dept) continue;
    const entry = result[dept.id] ?? {
      departmentId: dept.id,
      code: dept.code,
      name: dept.name,
      counts: {},
      total: 0,
    };
    entry.counts[row.status] = row._count._all;
    entry.total += row._count._all;
    result[dept.id] = entry;
  }

  return { date: target, departments: Object.values(result) };
}

export async function rangeStats(days: number = 7) {
  const days_clamped = Math.min(Math.max(days, 1), 30);
  const endDate = startOfDay();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days_clamped + 1);

  const byDateDept = await prisma.queue.groupBy({
    by: ["queueDate", "departmentId"],
    where: { queueDate: { gte: startDate, lte: endDate } },
    _count: { _all: true },
  });

  const departments = await prisma.department.findMany();
  const deptIndex = new Map(departments.map((d) => [d.id, d]));

  const result: Map<string, { date: string; departments: Array<{ departmentId: string; code: string; name: string; total: number }> }> = new Map();

  for (const row of byDateDept) {
    const dateKey = row.queueDate.toISOString().split('T')[0];
    const dept = deptIndex.get(row.departmentId);
    if (!dept) continue;

    if (!result.has(dateKey)) {
      result.set(dateKey, { date: dateKey, departments: [] });
    }

    const entry = result.get(dateKey);
    if (!entry) continue;

    const deptEntry = entry.departments.find((d) => d.departmentId === dept.id);
    if (deptEntry) {
      deptEntry.total += row._count._all;
    } else {
      entry.departments.push({
        departmentId: dept.id,
        code: dept.code,
        name: dept.name,
        total: row._count._all,
      });
    }
  }

  const sortedResult = Array.from(result.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return sortedResult;
}

export async function analyticsStats(fromDate: Date, toDate: Date) {
  const startDate = startOfDay(fromDate);
  const endDate = startOfDay(toDate);
  endDate.setDate(endDate.getDate() + 1);

  const byDateDept = await prisma.queue.groupBy({
    by: ["queueDate", "departmentId", "status"],
    where: { queueDate: { gte: startDate, lt: endDate } },
    _count: { _all: true },
    _avg: { actualWaitMinutes: true },
  });

  const departments = await prisma.department.findMany();
  const deptIndex = new Map(departments.map((d) => [d.id, d]));

  let totalQueues = 0;
  let totalDone = 0;
  let totalCancelled = 0;
  let totalSkipped = 0;
  let totalWaitMinutes = 0;
  let doneCount = 0;

  const byDate: Map<string, { total: number; done: number; cancelled: number; skipped: number }> = new Map();
  const byDept: Map<string, { total: number; done: number; cancelled: number; waitSum: number; waitCount: number }> = new Map();

  for (const row of byDateDept) {
    const dateKey = row.queueDate.toISOString().split('T')[0];
    const dept = deptIndex.get(row.departmentId);
    if (!dept) continue;

    totalQueues += row._count._all;

    if (row.status === QueueStatus.DONE) {
      totalDone += row._count._all;
      if (row._avg.actualWaitMinutes) {
        totalWaitMinutes += Math.round(row._avg.actualWaitMinutes * row._count._all);
        doneCount += row._count._all;
      }
    } else if (row.status === QueueStatus.CANCELLED) {
      totalCancelled += row._count._all;
    } else if (row.status === QueueStatus.SKIPPED) {
      totalSkipped += row._count._all;
    }

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { total: 0, done: 0, cancelled: 0, skipped: 0 });
    }
    const dateEntry = byDate.get(dateKey)!;
    dateEntry.total += row._count._all;
    if (row.status === QueueStatus.DONE) dateEntry.done += row._count._all;
    if (row.status === QueueStatus.CANCELLED) dateEntry.cancelled += row._count._all;
    if (row.status === QueueStatus.SKIPPED) dateEntry.skipped += row._count._all;

    const deptKey = dept.id;
    if (!byDept.has(deptKey)) {
      byDept.set(deptKey, { total: 0, done: 0, cancelled: 0, waitSum: 0, waitCount: 0 });
    }
    const deptEntry = byDept.get(deptKey)!;
    deptEntry.total += row._count._all;
    if (row.status === QueueStatus.DONE) {
      deptEntry.done += row._count._all;
      if (row._avg.actualWaitMinutes) {
        deptEntry.waitSum += Math.round(row._avg.actualWaitMinutes * row._count._all);
        deptEntry.waitCount += row._count._all;
      }
    }
    if (row.status === QueueStatus.CANCELLED) deptEntry.cancelled += row._count._all;
  }

  const avgWaitMinutes = doneCount > 0 ? Math.round(totalWaitMinutes / doneCount) : 0;
  const completionRate = totalQueues > 0 ? Math.round((totalDone / totalQueues) * 100 * 10) / 10 : 0;
  const cancellationRate = totalQueues > 0 ? Math.round(((totalCancelled + totalSkipped) / totalQueues) * 100 * 10) / 10 : 0;

  const byDateArray = Array.from(byDate.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const byDepartmentArray = Array.from(byDept.entries())
    .map(([deptId, data]) => {
      const dept = deptIndex.get(deptId);
      return {
        departmentId: deptId,
        name: dept?.name || 'Unknown',
        code: dept?.code || 'N/A',
        total: data.total,
        done: data.done,
        cancelled: data.cancelled,
        avgWaitMinutes: data.waitCount > 0 ? Math.round(data.waitSum / data.waitCount) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    summary: {
      totalQueues,
      totalDone,
      totalCancelled,
      totalSkipped,
      completionRate,
      cancellationRate,
      avgWaitMinutes,
    },
    byDate: byDateArray,
    byDepartment: byDepartmentArray,
  };
}
