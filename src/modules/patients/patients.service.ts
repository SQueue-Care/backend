import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../utils/errors";
import { buildPagination, paginationSkipTake, type PaginationQuery } from "../../utils/pagination";
import { hashPassword } from "../../utils/password";
import type { CreatePatientInput, UpdatePatientInput } from "./patients.schema";

const PATIENT_INCLUDE = {
  user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
} as const;

export async function listPatients(query: PaginationQuery) {
  const [items, total] = await Promise.all([
    prisma.patient.findMany({
      ...paginationSkipTake(query),
      orderBy: { createdAt: "desc" },
      include: PATIENT_INCLUDE,
    }),
    prisma.patient.count(),
  ]);
  return { items, pagination: buildPagination(query.page, query.pageSize, total) };
}

export async function getPatient(id: string) {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: PATIENT_INCLUDE,
  });
  if (!patient) throw new NotFoundError("Patient not found");
  return patient;
}

export async function createPatient(input: CreatePatientInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email sudah terdaftar");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: Role.PATIENT,
      patient: {
        create: {
          nik: input.nik,
          bpjsNumber: input.bpjsNumber,
          phone: input.phone,
          gender: input.gender,
          birthDate: input.birthDate,
          address: input.address,
        },
      },
    },
    include: { patient: true },
  });
  return user.patient;
}

export async function updatePatient(id: string, data: UpdatePatientInput) {
  return prisma.patient.update({ where: { id }, data, include: PATIENT_INCLUDE });
}

export async function deletePatient(id: string) {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new NotFoundError("Patient not found");
  await prisma.user.delete({ where: { id: patient.userId } });
}

export async function getPatientQueues(patientId: string) {
  return prisma.queue.findMany({
    where: { patientId },
    orderBy: { queueDate: "desc" },
    include: { department: true, doctor: { include: { user: { select: { name: true } } } } },
  });
}
