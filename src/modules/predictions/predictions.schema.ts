import { z } from "zod";

export const waitTimeQuerySchema = z.object({
  departmentId: z.string().min(1),
  scheduleId: z.string().optional(),
  doctorId: z.string().optional(),
});

export type WaitTimeQuery = z.infer<typeof waitTimeQuerySchema>;
