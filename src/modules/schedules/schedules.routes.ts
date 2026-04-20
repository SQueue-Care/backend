import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import {
  createScheduleSchema,
  listSchedulesQuerySchema,
  scheduleIdParamSchema,
  updateScheduleSchema,
} from "./schedules.schema";
import * as service from "./schedules.service";

const router: Router = Router();

router.get(
  "/",
  validate({ query: listSchedulesQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = listSchedulesQuerySchema.parse(req.query);
    const items = await service.listSchedules(filters);
    res.json(ApiResponse.success(items));
  }),
);

router.get(
  "/:id",
  validate({ params: scheduleIdParamSchema }),
  asyncHandler(async (req, res) => {
    const schedule = await service.getSchedule(getParam(req, "id"));
    res.json(ApiResponse.success(schedule));
  }),
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ body: createScheduleSchema }),
  asyncHandler(async (req, res) => {
    const schedule = await service.createSchedule(req.body);
    res.status(201).json(ApiResponse.success(schedule));
  }),
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ params: scheduleIdParamSchema, body: updateScheduleSchema }),
  asyncHandler(async (req, res) => {
    const schedule = await service.updateSchedule(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(schedule));
  }),
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: scheduleIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteSchedule(getParam(req, "id"));
    res.status(204).send();
  }),
);

export default router;
