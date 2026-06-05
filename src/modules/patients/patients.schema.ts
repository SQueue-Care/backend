import { Gender } from "@prisma/client";
import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination";

export const listPatientsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
});

export const patientIdParamSchema = z.object({ id: z.string().min(1) });

export const createPatientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  nik: z.string().length(16).optional(),
  bpjsNumber: z.string().optional(),
  phone: z.string().optional(),
  gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.OTHER]).optional(),
  birthDate: z.coerce.date().optional(),
  bloodType: z.string().max(8).optional(),
  allergies: z.string().max(2000).optional(),
  address: z.string().optional(),
});

export const updatePatientSchema = z.object({
  nik: z.string().length(16).optional(),
  bpjsNumber: z.string().optional(),
  phone: z.string().optional(),
  gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.OTHER]).optional(),
  birthDate: z.coerce.date().optional(),
  bloodType: z.string().max(8).optional(),
  allergies: z.string().max(2000).optional(),
  address: z.string().optional(),
});

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
