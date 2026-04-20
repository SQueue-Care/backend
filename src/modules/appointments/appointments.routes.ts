import { Role } from "@prisma/client";
import { Router } from "express";
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

export default router;
