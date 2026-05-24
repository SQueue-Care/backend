import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import {
  billIdParamSchema,
  createBillSchema,
  listBillsQuerySchema,
  payBillSchema,
  updateBillSchema,
} from "./bills.schema";
import * as service from "./bills.service";

const router: Router = Router();

router.use(authenticate);

router.get(
  "/",
  authorize(Role.ADMIN),
  validate({ query: listBillsQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const query = listBillsQuerySchema.parse(req.query);
    const { items, pagination } = await service.listBills(query, req.user);
    res.json(ApiResponse.paginated(items, pagination));
  }),
);

router.get(
  "/:id",
  validate({ params: billIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const bill = await service.getBill(getParam(req, "id"), req.user);
    res.json(ApiResponse.success(bill));
  }),
);

router.post(
  "/",
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ body: createBillSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const bill = await service.createBill(req.body, req.user);
    res.status(201).json(ApiResponse.success(bill));
  }),
);

router.patch(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: billIdParamSchema, body: updateBillSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const bill = await service.updateBill(getParam(req, "id"), req.body, req.user);
    res.json(ApiResponse.success(bill));
  }),
);

router.patch(
  "/:id/pay",
  validate({ params: billIdParamSchema, body: payBillSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const bill = await service.payBill(getParam(req, "id"), req.body, req.user);
    res.json(ApiResponse.success(bill));
  }),
);

export default router;
