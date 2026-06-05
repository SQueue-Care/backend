import { Role } from "@prisma/client";
import { z } from "zod";

export const userIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum([Role.PATIENT, Role.DOCTOR, Role.ADMIN]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
