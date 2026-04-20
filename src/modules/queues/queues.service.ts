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

  return prisma.queue.update({ where: { id }, data, include: QUEUE_INCLUDE });
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

  return prisma.queue.update({
    where: { id },
    data: { status: QueueStatus.CANCELLED, cancelledAt: new Date() },
    include: QUEUE_INCLUDE,
  });
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
