import { Role, QueueStatus, AppointmentStatus } from "@prisma/client";import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
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

  // Check and decrement schedule capacity
  if (input.scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: input.scheduleId }
    });

    if (!schedule) throw new NotFoundError("Schedule tidak ditemukan");

    if (schedule.capacity <= 0) {
      throw new BadRequestError("Kapasitas jadwal sudah penuh");
    }
  }

  const appointment = await prisma.appointment.create({
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

  // Decrement schedule capacity
  if (input.scheduleId) {
    await prisma.schedule.update({
      where: { id: input.scheduleId },
      data: { capacity: { decrement: 1 } }
    });
  }

  return appointment;
}

export async function updateAppointment(id: string, data: UpdateAppointmentInput) {
  const appointment = await prisma.appointment.findUnique({
    where: { id }
  });

  if (!appointment) throw new NotFoundError("Appointment tidak ditemukan");

  // If status changed to CANCELLED, increment capacity
  if (data.status === "CANCELLED" && appointment.status !== "CANCELLED" && appointment.scheduleId) {
    await prisma.schedule.update({
      where: { id: appointment.scheduleId },
      data: { capacity: { increment: 1 } }
    });
  }

  return prisma.appointment.update({ where: { id }, data, include: INCLUDE });
}

export async function deleteAppointment(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id }
  });

  if (!appointment) throw new NotFoundError("Appointment tidak ditemukan");

  // Increment capacity when deleting appointment
  if (appointment.scheduleId) {
    await prisma.schedule.update({
      where: { id: appointment.scheduleId },
      data: { capacity: { increment: 1 } }
    });
  }

  await prisma.appointment.delete({ where: { id } });
}


// FITUR SELF CHECK-IN & AUTO-CANCEL
export async function checkInAppointment(id: string, actor: Express.UserPayload) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw new NotFoundError("Reservasi tidak ditemukan");
  if (!appointment.patientId) throw new BadRequestError("Data pasien tidak valid pada reservasi ini");

  if (actor.role === Role.PATIENT) {
    const ownPatient = await prisma.patient.findUnique({ where: { userId: actor.id } });
    if (ownPatient?.id !== appointment.patientId) {
      throw new ForbiddenError("Akses ditolak. Anda tidak dapat melakukan check-in untuk reservasi pasien lain");
    }
  }

  if (appointment.status !== AppointmentStatus.CONFIRMED) {
    throw new BadRequestError("Hanya reservasi berstatus TERKONFIRMASI (CONFIRMED) yang dapat melakukan check-in");
  }

  const now = new Date();
  const scheduledTime = new Date(appointment.scheduledAt);
  const checkInWindowStart = new Date(scheduledTime.getTime() - 30 * 60000); // Sebelum 30 menit dari jadwal 
  
  if (now < checkInWindowStart) {
    throw new BadRequestError("Waktu check-in belum dibuka. Silakan kembali 30 menit sebelum jadwal sesi Anda.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const utc = scheduledTime.getTime() + (scheduledTime.getTimezoneOffset() * 60000);
    const wibTime = new Date(utc + (3600000 * 7));
    const wibDateString = wibTime.toISOString().split('T')[0];
    const targetDate = new Date(`${wibDateString}T12:00:00.000Z`);

    const lastQueue = await tx.queue.findFirst({
      where: { departmentId: appointment.departmentId, queueDate: targetDate },
      orderBy: { queueNumber: "desc" },
      select: { queueNumber: true },
    });
    const queueNumber = (lastQueue?.queueNumber ?? 0) + 1;

    const newQueue = await tx.queue.create({
      data: {
        patientId: appointment.patientId!,
        departmentId: appointment.departmentId,
        doctorId: appointment.doctorId,
        scheduleId: appointment.scheduleId,
        queueNumber: queueNumber,
        queueDate: targetDate,
        status: QueueStatus.WAITING,
        notes: appointment.notes,
        estimatedWaitMinutes: 0, 
      }
    });

    await tx.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.COMPLETED }
    });

    return newQueue;
  });

  return result;
}

export async function sweepExpiredAppointments() {
  const now = new Date();
  const expirationTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const expiredAppointments = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.CONFIRMED,
      scheduledAt: { lt: expirationTime }
    },
    select: { id: true, scheduleId: true }
  });

  let cancelledCount = 0;

  for (const apt of expiredAppointments) {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: apt.id },
        data: { 
          status: AppointmentStatus.CANCELLED,
          cancellationReason: "Dibatalkan otomatis oleh sistem: Pasien tidak melakukan check-in selama 24 jam dari jadwal."
        }
      });

      if (apt.scheduleId) {
        await tx.schedule.update({
          where: { id: apt.scheduleId },
          data: { capacity: { increment: 1 } }
        });
      }
    });
    cancelledCount++;
  }

  return cancelledCount;
}
