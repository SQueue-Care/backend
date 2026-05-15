import { Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import {
  appointmentIdParamSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./appointments.schema";
import * as service from "./appointments.service";

const router: Router = Router();

router.use(authenticate);

router.get(
  "/",
  authorize(Role.ADMIN, Role.DOCTOR),
  asyncHandler(async (_req, res) => {
    const items = await service.listAppointments();
    res.json(ApiResponse.success(items));
  }),
);

router.get(
  "/:id",
  validate({ params: appointmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const appointment = await service.getAppointment(getParam(req, "id"));
    res.json(ApiResponse.success(appointment));
  }),
);

router.post(
  "/",
  validate({ body: createAppointmentSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const appointment = await service.createAppointment(req.body, req.user);
    res.status(201).json(ApiResponse.success(appointment));
  }),
);

router.patch(
  "/:id",
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ params: appointmentIdParamSchema, body: updateAppointmentSchema }),
  asyncHandler(async (req, res) => {
    const appointment = await service.updateAppointment(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(appointment));
  }),
);

router.delete(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: appointmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteAppointment(getParam(req, "id"));
    res.status(204).send();
  }),
);

router.get(
  "/stats/overview",
  authorize(Role.ADMIN, Role.DOCTOR),
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date();
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();

    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    const stats = await prisma.appointment.groupBy({
      by: ["status"],
      where: { scheduledAt: { gte: startDate, lte: endDate } },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of stats) {
      byStatus[row.status] = row._count._all;
      total += row._count._all;
    }

    res.json(ApiResponse.success({ total, byStatus }));
  }),
);

export default router;
