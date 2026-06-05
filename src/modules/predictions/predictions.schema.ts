import { PatientType, QueuePriority } from "@prisma/client";
import { z } from "zod";

export const waitTimeQuerySchema = z.object({
  departmentId: z.string().min(1),
  scheduleId: z.string().optional(),
  doctorId: z.string().optional(),
  // Patient context for AI prediction
  patientId: z.string().optional(),
  priority: z.nativeEnum(QueuePriority).optional(),
  patientType: z.nativeEnum(PatientType).optional(),
  arrivalHour: z.number().int().min(0).max(23).optional(),
  queueDate: z.coerce.date().optional(),
});

export type WaitTimeQuery = z.infer<typeof waitTimeQuerySchema>;
