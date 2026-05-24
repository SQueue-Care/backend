import { z } from "zod";

export const departmentIdParamSchema = z.object({ id: z.string().min(1) });

export const departmentAvailabilityQuerySchema = z.object({
  date: z.coerce.date(),
  doctorId: z.string().min(1).optional(),
});

export const createDepartmentSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/i, "code hanya huruf/angka/_/-"),
  name: z.string().min(1),
  description: z.string().optional(),
  dailyBookingQuota: z.coerce.number().int().positive().max(5000).optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  dailyBookingQuota: z.coerce.number().int().positive().max(5000).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type DepartmentAvailabilityQuery = z.infer<typeof departmentAvailabilityQuerySchema>;
