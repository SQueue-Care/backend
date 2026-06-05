import { AppointmentStatus } from "@prisma/client";
import { z } from "zod";

export const appointmentIdParamSchema = z.object({ id: z.string().min(1) });

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1).optional(),
  doctorId: z.string().min(1),
  departmentId: z.string().min(1),
  scheduleId: z.string().optional(),
  scheduledAt: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  status: z
    .enum([
      AppointmentStatus.BOOKED,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ])
    .optional(),
  notes: z.string().max(500).optional(),
  cancellationReason: z.string().optional(), //perubahan
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
