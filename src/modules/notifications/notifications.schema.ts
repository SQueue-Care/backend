import { AnnouncementCategory, AnnouncementPriority, NotificationType, TargetRole } from "@prisma/client";
import { z } from "zod";

export const notificationIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const announcementIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(5000),
  priority: z.nativeEnum(AnnouncementPriority).default(AnnouncementPriority.NORMAL),
  category: z.nativeEnum(AnnouncementCategory).default(AnnouncementCategory.INFO),
  targetRole: z.nativeEnum(TargetRole).default(TargetRole.ALL),
  activeFrom: z.coerce.date().optional(),
  activeTo: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
  notifyUsers: z.boolean().default(true),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const listAnnouncementsQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;

export { NotificationType, TargetRole };
