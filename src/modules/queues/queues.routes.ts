import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import {
  createQueueSchema,
  listQueuesQuerySchema,
  queueIdParamSchema,
  updateQueueStatusSchema,
} from "./queues.schema";
import * as service from "./queues.service";

const router: Router = Router();

router.use(authenticate);

router.post(
  "/",
  validate({ body: createQueueSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const queue = await service.createQueue(req.body, req.user);
    res.status(201).json(ApiResponse.success(queue));
  }),
);

router.get(
  "/stats/overview",
  authorize(Role.ADMIN, Role.DOCTOR),
  asyncHandler(async (req, res) => {
    const dateParam = typeof req.query.date === "string" ? new Date(req.query.date) : undefined;
    const stats = await service.overviewStats(dateParam);
    res.json(ApiResponse.success(stats));
  }),
);

router.get(
  "/",
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ query: listQueuesQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = listQueuesQuerySchema.parse(req.query);
    const items = await service.listQueues(filters);
    res.json(ApiResponse.success(items));
  }),
);

router.get(
  "/:id",
  validate({ params: queueIdParamSchema }),
  asyncHandler(async (req, res) => {
    const queue = await service.getQueue(getParam(req, "id"));
    res.json(ApiResponse.success(queue));
  }),
);

router.patch(
  "/:id/status",
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ params: queueIdParamSchema, body: updateQueueStatusSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const queue = await service.updateQueueStatus(getParam(req, "id"), req.body, req.user);
    res.json(ApiResponse.success(queue));
  }),
);

router.post(
  "/:id/cancel",
  validate({ params: queueIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const queue = await service.cancelQueue(getParam(req, "id"), req.user);
    res.json(ApiResponse.success(queue));
  }),
);

export default router;
