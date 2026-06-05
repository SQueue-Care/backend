import { z } from "zod";

export const doctorIdParamSchema = z.object({ id: z.string().min(1) });

export const createDoctorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  specialization: z.string().min(1),
  licenseNumber: z.string().optional(),
  departmentId: z.string().optional(),
  avgServiceMin: z.coerce.number().int().positive().max(180).default(10),
});

export const updateDoctorSchema = z.object({
  specialization: z.string().min(1).optional(),
  licenseNumber: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  avgServiceMin: z.coerce.number().int().positive().max(180).optional(),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
