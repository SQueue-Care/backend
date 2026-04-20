import { Gender } from "@prisma/client";
import { z } from "zod";

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
  address: z.string().optional(),
});

export const updatePatientSchema = z.object({
  nik: z.string().length(16).optional(),
  bpjsNumber: z.string().optional(),
  phone: z.string().optional(),
  gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.OTHER]).optional(),
  birthDate: z.coerce.date().optional(),
  address: z.string().optional(),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
