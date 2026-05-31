import { PatientType, QueuePriority, QueueStatus } from "@prisma/client";
import { z } from "zod";

export const queueIdParamSchema = z.object({ id: z.string().min(1) });

export const createQueueSchema = z.object({
  patientId: z.string().min(1).optional(), // opsional — kalau kosong, diambil dari user login (PATIENT)
  departmentId: z.string().min(1),
  doctorId: z.string().optional(),
  scheduleId: z.string().optional(),
  notes: z.string().max(500).optional(),
  date: z.coerce.date().optional(),
  priority: z.nativeEnum(QueuePriority).optional().default(QueuePriority.NORMAL),
  patientType: z.nativeEnum(PatientType).optional().default(PatientType.RAWAT_JALAN),
});

export const updateQueueStatusSchema = z.object({
  status: z.enum([
    QueueStatus.WAITING,
    QueueStatus.CALLED,
    QueueStatus.IN_PROGRESS,
    QueueStatus.DONE,
    QueueStatus.SKIPPED,
    QueueStatus.CANCELLED,
  ]),
  notes: z.string().max(500).optional(),
});

export const updateDoctorNotesSchema = z.object({
  diagnosis: z.string().max(2000).optional().nullable(),
  medicationInstructions: z.string().max(2000).optional().nullable(),
  advice: z.string().max(2000).optional().nullable(),
});

export const updateVisitStageSchema = z.object({
  action: z.enum(["ADMIN_ARRIVED", "PHARMACY_COMPLETE"]),
});

export const listQueuesQuerySchema = z.object({
  departmentId: z.string().optional(),
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  date: z.coerce.date().optional(),
  status: z
    .enum([
      QueueStatus.WAITING,
      QueueStatus.CALLED,
      QueueStatus.IN_PROGRESS,
      QueueStatus.DONE,
      QueueStatus.SKIPPED,
      QueueStatus.CANCELLED,
    ])
    .optional(),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueStatusInput = z.infer<typeof updateQueueStatusSchema>;
export type UpdateDoctorNotesInput = z.infer<typeof updateDoctorNotesSchema>;
export type UpdateVisitStageInput = z.infer<typeof updateVisitStageSchema>;
export type ListQueuesQuery = z.infer<typeof listQueuesQuerySchema>;
