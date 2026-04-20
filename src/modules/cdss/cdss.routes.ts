import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { recommendSchema } from "./cdss.schema";
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

router.post(
  "/recommend",
  authenticate,
  authorize(Role.DOCTOR, Role.ADMIN),
  validate({ body: recommendSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.recommend(req.body);
    res.json(ApiResponse.success(result));
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

export default router;
