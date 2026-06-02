import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import { analyzeNotesSchema, recommendSchema } from "./cdss.schema";
import * as service from "./cdss.service";

const router: Router = Router();

router.get(
  "/symptoms",
  authenticate,
  asyncHandler(async (_req, res) => {
    const items = await service.listSymptoms();
    res.json(ApiResponse.success(items));
  }),
);

router.get(
  "/ai-status",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  asyncHandler(async (_req, res) => {
    const status = await service.getAiStatus();
    res.json(ApiResponse.success(status));
  }),
);

router.post(
  "/recommend",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validate({ body: recommendSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const result = await service.recommend({
      ...req.body,
      doctorId: req.user.id,
    });
    res.json(ApiResponse.success(result));
  }),
);

router.get(
  "/latest",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const result = await service.findLatestResult(req.user.id);
    res.json(ApiResponse.success(result ?? null));
  }),
);

router.get(
  "/by-queue/:queueId",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const queueId = getParam(req, "queueId");
    const result = await service.findByQueueId(queueId);
    res.json(ApiResponse.success(result ?? null));
  }),
);

router.get(
  "/results",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const limit = parseInt(req.query.limit as string) || 20;
    const results = await service.listResultsByDoctor(req.user.id, limit);
    res.json(ApiResponse.success(results));
  }),
);

router.get(
  "/history/:patientId",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const items = await service.historyForPatient(getParam(req, "patientId"));
    res.json(ApiResponse.success(items));
  }),
);

router.post(
  "/analyze-notes",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validate({ body: analyzeNotesSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const result = await service.analyzeNotes({
      ...req.body,
      doctorId: req.user.id,
    });
    res.json(ApiResponse.success(result));
  }),
);

export default router;
