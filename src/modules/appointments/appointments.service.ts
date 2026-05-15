import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
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
