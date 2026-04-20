import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  updateDepartmentSchema,
} from "./departments.schema";
import * as service from "./departments.service";

const router: Router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await service.listDepartments();
    res.json(ApiResponse.success(items));
  }),
);

router.get(
  "/:id",
  validate({ params: departmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    const dept = await service.getDepartment(getParam(req, "id"));
    res.json(ApiResponse.success(dept));
  }),
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: createDepartmentSchema }),
  asyncHandler(async (req, res) => {
    const dept = await service.createDepartment(req.body);
    res.status(201).json(ApiResponse.success(dept));
  }),
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  asyncHandler(async (req, res) => {
    const dept = await service.updateDepartment(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(dept));
  }),
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: departmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteDepartment(getParam(req, "id"));
    res.status(204).send();
  }),
);

export default router;
