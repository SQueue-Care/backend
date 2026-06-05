import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../utils/errors";
import { buildPagination, paginationSkipTake, type PaginationQuery } from "../../utils/pagination";
import { hashPassword } from "../../utils/password";
import type { CreateDoctorInput, UpdateDoctorInput } from "./doctors.schema";

const DOCTOR_INCLUDE = {
  user: { select: { id: true, email: true, name: true, role: true } },
  department: true,
} as const;

export async function listDoctors(query: PaginationQuery) {
  const [items, total] = await Promise.all([
    prisma.doctor.findMany({
      ...paginationSkipTake(query),
      orderBy: { createdAt: "desc" },
      include: DOCTOR_INCLUDE,
    }),
    prisma.doctor.count(),
  ]);
  return { items, pagination: buildPagination(query.page, query.pageSize, total) };
}

export async function getDoctor(id: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: DOCTOR_INCLUDE,
  });
  if (!doctor) throw new NotFoundError("Doctor not found");
  return doctor;
}

export async function createDoctor(input: CreateDoctorInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email sudah terdaftar");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: Role.DOCTOR,
      doctor: {
        create: {
          specialization: input.specialization,
          licenseNumber: input.licenseNumber,
          departmentId: input.departmentId,
          avgServiceMin: input.avgServiceMin,
        },
      },
    },
    include: { doctor: { include: { department: true } } },
  });
  return user.doctor;
}

export async function updateDoctor(id: string, data: UpdateDoctorInput) {
  return prisma.doctor.update({ where: { id }, data, include: DOCTOR_INCLUDE });
}

export async function deleteDoctor(id: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) throw new NotFoundError("Doctor not found");
  await prisma.user.delete({ where: { id: doctor.userId } });
}

export async function getDoctorSchedules(doctorId: string) {
  return prisma.schedule.findMany({
    where: { doctorId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { department: true },
  });
}

export async function getDoctorAppointments(doctorId: string) {
  return prisma.appointment.findMany({
    where: { doctorId },
    orderBy: { scheduledAt: "desc" },
    include: {
      patient: { include: { user: { select: { name: true, email: true } } } },
      doctor: { include: { user: { select: { name: true } } } },
      department: true,
      schedule: true,
    },
  });
}
