import { QueueStatus, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { buildPagination, paginationSkipTake } from "../../utils/pagination";
import { hashPassword } from "../../utils/password";
import { serializeQueue, QUEUE_INCLUDE } from "../queues/queues.service";
import type { CreatePatientInput, ListPatientsQuery, UpdatePatientInput } from "./patients.schema";

const PATIENT_INCLUDE = {
  user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
} as const;

export async function listPatients(query: ListPatientsQuery) {
  const where = query.search
    ? {
        OR: [
          { user: { name: { contains: query.search, mode: "insensitive" as const } } },
          { user: { email: { contains: query.search, mode: "insensitive" as const } } },
          { nik: { contains: query.search } },
          { bpjsNumber: { contains: query.search } },
        ],
      }
    : undefined;

  const [items, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      ...paginationSkipTake(query),
      orderBy: { createdAt: "desc" },
      include: PATIENT_INCLUDE,
    }),
    prisma.patient.count({ where }),
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
          bloodType: input.bloodType,
          allergies: input.allergies,
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
  const items = await prisma.queue.findMany({
    where: { patientId },
    orderBy: { queueDate: "desc" },
    include: QUEUE_INCLUDE,
  });
  return items.map((q) => serializeQueue(q));
}

const MEDICAL_HISTORY_LIMIT = 20;

export async function getPatientMedicalProfile(patientId: string, actor: Express.UserPayload) {
  if (actor.role !== Role.DOCTOR && actor.role !== Role.ADMIN) {
    throw new ForbiddenError("Hanya dokter yang dapat mengakses profil medis pasien");
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: PATIENT_INCLUDE,
  });
  if (!patient) throw new NotFoundError("Patient not found");

  const medicalHistory = await prisma.queue.findMany({
    where: { patientId, status: QueueStatus.DONE },
    orderBy: [{ finishedAt: "desc" }, { queueDate: "desc" }],
    take: MEDICAL_HISTORY_LIMIT,
    include: QUEUE_INCLUDE,
  });

  return {
    patient,
    medicalHistory: medicalHistory.map((q) => serializeQueue(q)),
  };
}

export async function getPatientAppointments(patientId: string) {
  return prisma.appointment.findMany({
    where: { patientId },
    orderBy: { scheduledAt: "desc" },
    include: {
      patient: { include: PATIENT_INCLUDE },
      doctor: { include: { user: { select: { name: true } } } },
      department: true,
      schedule: true,
    },
  });
}
