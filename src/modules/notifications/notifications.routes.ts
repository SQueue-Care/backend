import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import {
  announcementIdParamSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  updateAnnouncementSchema,
} from "./notifications.schema";
import * as service from "./notifications.service";

const router: Router = Router();

router.use(authenticate);

// ── User notifications ──────────────────────────────────────

router.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const query = listNotificationsQuerySchema.parse(req.query);
    const result = await service.listNotifications(req.user, query);
    res.json(ApiResponse.success(result));
  }),
);

router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const result = await service.markAllNotificationsRead(req.user);
    res.json(ApiResponse.success(result));
  }),
);

router.patch(
  "/:id/read",
  validate({ params: notificationIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const notification = await service.markNotificationRead(getParam(req, "id"), req.user);
    res.json(ApiResponse.success(notification));
  }),
);

export default router;

export const announcementsRouter: Router = Router();

announcementsRouter.use(authenticate);

announcementsRouter.get(
  "/",
  validate({ query: listAnnouncementsQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const query = listAnnouncementsQuerySchema.parse(req.query);
    const items = await service.listAnnouncements(query, req.user);
    res.json(ApiResponse.success(items));
  }),
);

announcementsRouter.post(
  "/",
  authorize(Role.ADMIN),
  validate({ body: createAnnouncementSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const announcement = await service.createAnnouncement(req.body, req.user);
    res.status(201).json(ApiResponse.success(announcement));
  }),
);

announcementsRouter.patch(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: announcementIdParamSchema, body: updateAnnouncementSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const announcement = await service.updateAnnouncement(
      getParam(req, "id"),
      req.body,
      req.user,
    );
    res.json(ApiResponse.success(announcement));
  }),
);

announcementsRouter.delete(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: announcementIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteAnnouncement(getParam(req, "id"));
    res.status(204).send();
  }),
);
