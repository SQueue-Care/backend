import { DayOfWeek } from "@prisma/client";
import { z } from "zod";

const timeHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:mm");

export const scheduleIdParamSchema = z.object({ id: z.string().min(1) });

const dayEnum = z.enum([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
]);

const base = {
  doctorId: z.string().min(1),
  departmentId: z.string().min(1),
  dayOfWeek: dayEnum,
  startTime: timeHHmm,
  endTime: timeHHmm,
  capacity: z.coerce.number().int().positive().max(500).default(30),
  isActive: z.boolean().default(true),
};

export const createScheduleSchema = z.object(base).refine((v) => v.startTime < v.endTime, {
  message: "startTime harus lebih kecil dari endTime",
  path: ["endTime"],
});

export const updateScheduleSchema = z
  .object({
    dayOfWeek: dayEnum.optional(),
    startTime: timeHHmm.optional(),
    endTime: timeHHmm.optional(),
    capacity: z.coerce.number().int().positive().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    message: "startTime harus lebih kecil dari endTime",
    path: ["endTime"],
  });

export const listSchedulesQuerySchema = z.object({
  doctorId: z.string().optional(),
  departmentId: z.string().optional(),
  dayOfWeek: dayEnum.optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
