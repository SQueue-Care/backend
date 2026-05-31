import { AppointmentStatus, QueueStatus, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import {
  releaseBookingCapacity,
  reserveBookingCapacity,
  reserveDepartmentQuota,
  toBookingDate,
  withSerializableTransaction,
} from "../booking/booking-capacity";
import { estimateWaitTime } from "../predictions/predictions.service";
import { QUEUE_INCLUDE, serializeQueue } from "../queues/queues.service";
import { parseSessionStartHour } from "../queues/session-time";
import type { CreateAppointmentInput, UpdateAppointmentInput } from "./appointments.schema";

const INCLUDE = {
  patient: { include: { user: { select: { name: true } } } },
  doctor: { include: { user: { select: { name: true } } } },
  department: true,
  schedule: true,
} as const;

export async function listAppointments() {
  return prisma.appointment.findMany({
    orderBy: { scheduledAt: "desc" },
    include: INCLUDE,
  });
}

export async function getAppointment(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: INCLUDE,
  });
  if (!appointment) throw new NotFoundError("Appointment not found");
  return appointment;
}

export async function createAppointment(input: CreateAppointmentInput, actor: Express.UserPayload) {
  let patientId = input.patientId;
  if (!patientId) {
    if (actor.role !== Role.PATIENT) {
      throw new BadRequestError("patientId wajib diisi jika bukan pasien");
    }
    const patient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (!patient) throw new NotFoundError("Profil pasien tidak ditemukan");
    patientId = patient.id;
  } else if (actor.role === Role.PATIENT) {
    const own = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (own?.id !== patientId) {
      throw new ForbiddenError("Tidak dapat membuat appointment untuk pasien lain");
    }
  }

  const bookingDate = toBookingDate(input.scheduledAt);

  return withSerializableTransaction(async (tx) => {
    if (input.scheduleId) {
      await reserveBookingCapacity(tx, {
        scheduleId: input.scheduleId,
        departmentId: input.departmentId,
        bookingDate,
      });
    } else {
      await reserveDepartmentQuota(tx, {
        departmentId: input.departmentId,
        bookingDate,
      });
    }

    return tx.appointment.create({
      data: {
        patientId,
        doctorId: input.doctorId,
        departmentId: input.departmentId,
        scheduleId: input.scheduleId,
        scheduledAt: input.scheduledAt,
        notes: input.notes,
      },
      include: INCLUDE,
    });
  });
}

export async function updateAppointment(id: string, data: UpdateAppointmentInput) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) throw new NotFoundError("Appointment tidak ditemukan");

  if (data.status === "CANCELLED" && appointment.status !== "CANCELLED") {
    return withSerializableTransaction(async (tx) => {
      await releaseBookingCapacity(tx, {
        scheduleId: appointment.scheduleId,
        departmentId: appointment.departmentId,
        bookingDate: toBookingDate(appointment.scheduledAt),
      });
      return tx.appointment.update({ where: { id }, data, include: INCLUDE });
    });
  }

  return prisma.appointment.update({ where: { id }, data, include: INCLUDE });
}

export async function deleteAppointment(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) throw new NotFoundError("Appointment tidak ditemukan");

  await withSerializableTransaction(async (tx) => {
    if (appointment.status !== AppointmentStatus.CANCELLED) {
      await releaseBookingCapacity(tx, {
        scheduleId: appointment.scheduleId,
        departmentId: appointment.departmentId,
        bookingDate: toBookingDate(appointment.scheduledAt),
      });
    }
    await tx.appointment.delete({ where: { id } });
  });
}

// FITUR SELF CHECK-IN & AUTO-CANCEL
export async function checkInAppointment(id: string, actor: Express.UserPayload) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw new NotFoundError("Reservasi tidak ditemukan");
  if (!appointment.patientId)
    throw new BadRequestError("Data pasien tidak valid pada reservasi ini");

  if (actor.role === Role.PATIENT) {
    const ownPatient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (ownPatient?.id !== appointment.patientId) {
      throw new ForbiddenError(
        "Akses ditolak. Anda tidak dapat melakukan check-in untuk reservasi pasien lain",
      );
    }
  }

  if (appointment.status !== AppointmentStatus.CONFIRMED) {
    throw new BadRequestError(
      "Hanya reservasi berstatus TERKONFIRMASI (CONFIRMED) yang dapat melakukan check-in",
    );
  }

  const now = new Date();
  const scheduledTime = new Date(appointment.scheduledAt);
  const checkInWindowStart = new Date(scheduledTime.getTime() - 30 * 60000);

  if (now < checkInWindowStart) {
    throw new BadRequestError(
      "Waktu check-in belum dibuka. Silakan kembali 30 menit sebelum jadwal sesi Anda.",
    );
  }

  const targetDate = toBookingDate(appointment.scheduledAt);

  let arrivalHour = scheduledTime.getHours();
  if (appointment.scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: appointment.scheduleId },
      select: { startTime: true },
    });
    if (schedule?.startTime) {
      arrivalHour = parseSessionStartHour(schedule.startTime);
    }
  }

  const estimate = await estimateWaitTime({
    departmentId: appointment.departmentId,
    doctorId: appointment.doctorId,
    scheduleId: appointment.scheduleId ?? undefined,
    patientId: appointment.patientId!,
    queueDate: targetDate,
    arrivalHour,
  });

  const result = await withSerializableTransaction(async (tx) => {
    const queueNumber = await tx.queue
      .findFirst({
        where: { departmentId: appointment.departmentId, queueDate: targetDate },
        orderBy: { queueNumber: "desc" },
        select: { queueNumber: true },
      })
      .then((last) => (last?.queueNumber ?? 0) + 1);

    const newQueue = await tx.queue.create({
      data: {
        patientId: appointment.patientId!,
        departmentId: appointment.departmentId,
        doctorId: appointment.doctorId,
        scheduleId: appointment.scheduleId,
        queueNumber,
        queueDate: targetDate,
        status: QueueStatus.WAITING,
        notes: appointment.notes,
        estimatedWaitMinutes: estimate.estimatedMinutes,
        prediction: {
          create: {
            estimatedMin: estimate.estimatedMinutes,
            source: estimate.source,
            modelVersion: estimate.modelVersion,
            kategori: estimate.kategori,
            features: {
              waitingAhead: estimate.waitingAhead,
              avgServiceMinutes: estimate.avgServiceMinutes,
              sessionStartAt: estimate.sessionStartAt,
              estimatedCallAt: estimate.estimatedCallAt,
            },
          },
        },
      },
    });

    await tx.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.COMPLETED },
    });

    return newQueue;
  });

  const queue = await prisma.queue.findUnique({
    where: { id: result.id },
    include: QUEUE_INCLUDE,
  });
  if (!queue) throw new NotFoundError("Antrian tidak ditemukan setelah check-in");

  return serializeQueue(queue);
}

export async function sweepExpiredAppointments() {
  const now = new Date();
  const expirationTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const expiredAppointments = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.CONFIRMED,
      scheduledAt: { lt: expirationTime },
    },
    select: { id: true, scheduleId: true, departmentId: true, scheduledAt: true },
  });

  let cancelledCount = 0;

  for (const apt of expiredAppointments) {
    await withSerializableTransaction(async (tx) => {
      await tx.appointment.update({
        where: { id: apt.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellationReason:
            "Dibatalkan otomatis oleh sistem: Pasien tidak melakukan check-in selama 24 jam dari jadwal.",
        },
      });

      await releaseBookingCapacity(tx, {
        scheduleId: apt.scheduleId,
        departmentId: apt.departmentId,
        bookingDate: toBookingDate(apt.scheduledAt),
      });
    });
    cancelledCount++;
  }

  return cancelledCount;
}
