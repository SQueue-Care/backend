import { PatientType, QueuePriority, QueueStatus, Role, VisitStage, type Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import {
  assertNoActiveQueueDuplicate,
  nextQueueNumberInTransaction,
  releaseBookingCapacity,
  reserveBookingCapacity,
  reserveDepartmentQuota,
  toBookingDate,
  withSerializableTransaction,
} from "../booking/booking-capacity";
import { hasConflictingActivePatient, isActiveServingStatus } from "./doctor-serving";
import { createBillForQueue } from "../bills/bills.service";
import { estimateWaitTime } from "../predictions/predictions.service";
import {
  notifyQueueStatusChange,
  notifyVisitStageChange,
} from "../notifications/notifications.service";
import {
  buildVisitFlow,
  resolvePharmacyRequired,
  type VisitFlowPayload,
} from "./visit-flow";
import type {
  CreateQueueInput,
  ListQueuesQuery,
  UpdateDoctorNotesInput,
  UpdateQueueStatusInput,
  UpdateVisitStageInput,
} from "./queues.schema";

export const QUEUE_INCLUDE = {
  patient: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  doctor: { include: { user: { select: { id: true, name: true } } } },
  department: true,
  prediction: true,
  bill: { select: { id: true, status: true, paymentType: true, patientShare: true } },
} satisfies Prisma.QueueInclude;

type QueueRecord = Prisma.QueueGetPayload<{ include: typeof QUEUE_INCLUDE }>;

type QueueWithDoctorFields = {
  doctorDiagnosis?: string | null;
  doctorMedicationInstructions?: string | null;
  doctorAdvice?: string | null;
};

export type SerializedDoctorNotes = {
  diagnosis: string | null;
  medicationInstructions: string | null;
  advice: string | null;
} | null;

export type SerializedQueue = Omit<
  QueueRecord,
  "doctorDiagnosis" | "doctorMedicationInstructions" | "doctorAdvice"
> & {
  doctorNotes: SerializedDoctorNotes;
  currentServingNumber?: number | null;
  visitFlow: VisitFlowPayload;
  nextDestination: VisitFlowPayload["nextDestination"];
};

function serializeDoctorNotes(queue: QueueWithDoctorFields): SerializedDoctorNotes {
  const { doctorDiagnosis, doctorMedicationInstructions, doctorAdvice } = queue;
  if (!doctorDiagnosis && !doctorMedicationInstructions && !doctorAdvice) {
    return null;
  }
  return {
    diagnosis: doctorDiagnosis ?? null,
    medicationInstructions: doctorMedicationInstructions ?? null,
    advice: doctorAdvice ?? null,
  };
}

export function serializeQueue<T extends QueueRecord>(
  queue: T,
  extra?: { currentServingNumber?: number | null },
): Omit<T, "doctorDiagnosis" | "doctorMedicationInstructions" | "doctorAdvice"> & {
  doctorNotes: SerializedDoctorNotes;
  currentServingNumber?: number | null;
  visitFlow: VisitFlowPayload;
  nextDestination: VisitFlowPayload["nextDestination"];
} {
  const {
    doctorDiagnosis: _d,
    doctorMedicationInstructions: _m,
    doctorAdvice: _a,
    ...rest
  } = queue;
  const visitFlow = buildVisitFlow(queue, queue.department);
  return {
    ...rest,
    doctorNotes: serializeDoctorNotes(queue),
    visitFlow,
    nextDestination: visitFlow.nextDestination,
    ...extra,
  };
}

function startOfDay(dateInput?: Date | string): Date {
  if (dateInput) {
    return toBookingDate(dateInput);
  }

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibTime = new Date(utc + 3600000 * 7);
  const wibDateString = wibTime.toISOString().split("T")[0] ?? "";
  return new Date(`${wibDateString}T12:00:00.000Z`);
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

  const targetDate = startOfDay(input.date);

  const estimate = await estimateWaitTime({
    departmentId: input.departmentId,
    doctorId: input.doctorId,
    scheduleId: input.scheduleId,
    patientId,
    priority: input.priority ?? QueuePriority.NORMAL,
    patientType: input.patientType ?? PatientType.RAWAT_JALAN,
    arrivalHour: new Date().getHours(),
    queueDate: targetDate,
  });

  const queue = await withSerializableTransaction(async (tx) => {
    await assertNoActiveQueueDuplicate(tx, {
      patientId,
      departmentId: input.departmentId,
      bookingDate: targetDate,
    });

    if (input.scheduleId) {
      await reserveBookingCapacity(tx, {
        scheduleId: input.scheduleId,
        departmentId: input.departmentId,
        bookingDate: targetDate,
      });
    } else {
      await reserveDepartmentQuota(tx, {
        departmentId: input.departmentId,
        bookingDate: targetDate,
      });
    }

    const queueNumber = await nextQueueNumberInTransaction(tx, input.departmentId, targetDate);

    return tx.queue.create({
      data: {
        patientId,
        departmentId: input.departmentId,
        doctorId: input.doctorId,
        scheduleId: input.scheduleId,
        queueNumber,
        queueDate: targetDate,
        estimatedWaitMinutes: estimate.estimatedMinutes,
        notes: input.notes,
        priority: input.priority ?? QueuePriority.NORMAL,
        patientType: input.patientType ?? PatientType.RAWAT_JALAN,
        currentVisitStage: VisitStage.WAITING,
        prediction: {
          create: {
            estimatedMin: estimate.estimatedMinutes,
            source: estimate.source,
            modelVersion: estimate.modelVersion,
            kategori: estimate.kategori,
            features: {
              waitingAhead: estimate.waitingAhead,
              avgServiceMinutes: estimate.avgServiceMinutes,
            },
          },
        },
      },
      include: QUEUE_INCLUDE,
    });
  });

  return serializeQueue(queue);
}

// Perubahan daftar pasien yang sedang berlangsung 
export async function getQueue(id: string) {
  const queue = await prisma.queue.findUnique({ where: { id }, include: QUEUE_INCLUDE });
  if (!queue) throw new NotFoundError("Queue not found");

  const targetDate = startOfDay(queue.queueDate);
  const activeServing = await prisma.queue.findFirst({
    where: {
      departmentId: queue.departmentId,
      queueDate: targetDate,
      status: { in: [QueueStatus.CALLED, QueueStatus.IN_PROGRESS] }
    },
    orderBy: { queueNumber: 'asc' },
    select: { queueNumber: true }
  });

  let currentServingNumber = activeServing?.queueNumber || null;

  if (!currentServingNumber) {
    const lastDone = await prisma.queue.findFirst({
      where: {
        departmentId: queue.departmentId,
        queueDate: targetDate,
        status: QueueStatus.DONE
      },
      orderBy: { queueNumber: 'desc' },
      select: { queueNumber: true }
    });
    currentServingNumber = lastDone?.queueNumber || null;
  }

  return serializeQueue(queue, { currentServingNumber });
}

export async function listQueues(filters: ListQueuesQuery) {
  const where: Prisma.QueueWhereInput = {
    departmentId: filters.departmentId,
    doctorId: filters.doctorId,
    patientId: filters.patientId,
    status: filters.status,
    queueDate: filters.date ? startOfDay(filters.date) : undefined,
  };
  const items = await prisma.queue.findMany({
    where,
    orderBy: [{ queueDate: "desc" }, { queueNumber: "asc" }],
    include: QUEUE_INCLUDE,
  });
  return items.map((q) => serializeQueue(q));
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
  actor: Express.UserPayload,
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

  if (isActiveServingStatus(input.status) && actor.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actor.id } });
    if (!doctor) throw new ForbiddenError("Profil dokter tidak ditemukan");

    if (queue.departmentId !== doctor.departmentId) {
      throw new ForbiddenError("Antrian ini bukan di poli Anda");
    }

    const targetDate = startOfDay(queue.queueDate);
    const doctorActiveQueues = await prisma.queue.findMany({
      where: {
        doctorId: doctor.id,
        queueDate: targetDate,
        status: { in: [QueueStatus.CALLED, QueueStatus.IN_PROGRESS] },
      },
      select: { id: true, status: true },
    });

    if (hasConflictingActivePatient(doctorActiveQueues, id)) {
      throw new BadRequestError("Selesaikan pasien saat ini terlebih dahulu");
    }

    data.doctor = { connect: { id: doctor.id } };
  }

  if (input.status === QueueStatus.CALLED) {
    data.calledAt = now;
    data.currentVisitStage = VisitStage.EXAMINATION;
  }
  if (input.status === QueueStatus.IN_PROGRESS) {
    data.startedAt = now;
    data.currentVisitStage = VisitStage.EXAMINATION;
  }
  if (input.status === QueueStatus.DONE) {
    data.finishedAt = now;
    data.currentVisitStage = VisitStage.ADMIN;
    data.pharmacyRequired = resolvePharmacyRequired({
      ...queue,
      doctorMedicationInstructions:
        queue.doctorMedicationInstructions ?? null,
    });
    if (queue.startedAt) {
      data.actualWaitMinutes = Math.max(
        0,
        Math.round((queue.startedAt.getTime() - queue.checkInAt.getTime()) / 60_000),
      );
    }
  }
  if (input.status === QueueStatus.CANCELLED) {
    data.cancelledAt = now;
  }
  if (input.status === QueueStatus.SKIPPED) {
    data.currentVisitStage = VisitStage.WAITING;
  }

  const updated = await prisma.queue.update({ where: { id }, data, include: QUEUE_INCLUDE });

  if (input.status === QueueStatus.DONE) {
    try {
      await createBillForQueue(id);
    } catch (err) {
      console.error("[billing] Gagal membuat tagihan otomatis:", err);
    }
  }

  if (input.status === QueueStatus.CANCELLED && queue.status !== QueueStatus.CANCELLED) {
    await withSerializableTransaction(async (tx) => {
      await releaseBookingCapacity(tx, {
        scheduleId: queue.scheduleId,
        departmentId: queue.departmentId,
        bookingDate: queue.queueDate,
      });
    });
  }

  try {
    await notifyQueueStatusChange(updated, queue.status);
  } catch (err) {
    console.error("[notifications] Gagal mengirim notifikasi status antrean:", err);
  }

  return serializeQueue(updated);
}

const DOCTOR_NOTES_EDITABLE: QueueStatus[] = [
  QueueStatus.CALLED,
  QueueStatus.IN_PROGRESS,
  QueueStatus.DONE,
];

export async function updateDoctorNotes(
  id: string,
  input: UpdateDoctorNotesInput,
  actor: Express.UserPayload,
) {
  const queue = await prisma.queue.findUnique({ where: { id } });
  if (!queue) throw new NotFoundError("Queue not found");

  if (actor.role !== Role.DOCTOR && actor.role !== Role.ADMIN) {
    throw new ForbiddenError("Hanya dokter yang dapat mengisi catatan medis");
  }

  if (!DOCTOR_NOTES_EDITABLE.includes(queue.status)) {
    throw new BadRequestError(
      "Catatan dokter hanya dapat diisi saat pasien dipanggil, diperiksa, atau setelah selesai",
    );
  }

  if (actor.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actor.id } });
    if (!doctor) throw new ForbiddenError("Profil dokter tidak ditemukan");
    if (queue.departmentId !== doctor.departmentId) {
      throw new ForbiddenError("Antrian ini bukan di poli Anda");
    }
  }

  const updated = await prisma.queue.update({
    where: { id },
    data: {
      doctorDiagnosis: input.diagnosis ?? null,
      doctorMedicationInstructions: input.medicationInstructions ?? null,
      doctorAdvice: input.advice ?? null,
      pharmacyRequired: resolvePharmacyRequired({
        ...queue,
        doctorMedicationInstructions: input.medicationInstructions ?? null,
      }),
    },
    include: QUEUE_INCLUDE,
  });

  return serializeQueue(updated);
}

export async function updateVisitStage(
  id: string,
  input: UpdateVisitStageInput,
  actor: Express.UserPayload,
) {
  const queue = await prisma.queue.findUnique({ where: { id }, include: { patient: true } });
  if (!queue) throw new NotFoundError("Queue not found");

  if (actor.role === Role.PATIENT) {
    const ownPatient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (ownPatient?.id !== queue.patientId) {
      throw new ForbiddenError("Tidak dapat memperbarui kunjungan pasien lain");
    }
  }

  const now = new Date();
  const data: Prisma.QueueUpdateInput = {};

  if (input.action === "ADMIN_ARRIVED") {
    if (queue.status !== QueueStatus.DONE) {
      throw new BadRequestError("Tahap administrasi hanya setelah pemeriksaan selesai");
    }
    data.adminArrivedAt = now;
  }

  if (input.action === "PHARMACY_COMPLETE") {
    if (!resolvePharmacyRequired(queue)) {
      throw new BadRequestError("Kunjungan ini tidak memerlukan pengambilan obat");
    }
    data.pharmacyCompletedAt = now;
    data.currentVisitStage = VisitStage.COMPLETE;
    data.visitCompletedAt = now;
  }

  const updated = await prisma.queue.update({ where: { id }, data, include: QUEUE_INCLUDE });

  try {
    await notifyVisitStageChange(updated, input.action);
  } catch (err) {
    console.error("[notifications] Gagal mengirim notifikasi tahap kunjungan:", err);
  }

  return serializeQueue(updated);
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

  const previousStatus = queue.status;
  const updated = await prisma.queue.update({
    where: { id },
    data: { status: QueueStatus.CANCELLED, cancelledAt: new Date() },
    include: QUEUE_INCLUDE,
  });

  await withSerializableTransaction(async (tx) => {
    await releaseBookingCapacity(tx, {
      scheduleId: queue.scheduleId,
      departmentId: queue.departmentId,
      bookingDate: queue.queueDate,
    });
  });

  try {
    await notifyQueueStatusChange(updated, previousStatus);
  } catch (err) {
    console.error("[notifications] Gagal mengirim notifikasi pembatalan antrean:", err);
  }

  return serializeQueue(updated);
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
    const dateKey = row.queueDate.toISOString().split("T")[0] ?? "";
    const dept = deptIndex.get(row.departmentId);
    if (!dept || !dateKey) continue;

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
    const dateKey = row.queueDate.toISOString().split("T")[0] ?? "";
    const dept = deptIndex.get(row.departmentId);
    if (!dept || !dateKey) continue;

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
