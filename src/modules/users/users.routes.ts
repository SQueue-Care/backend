import { Role } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { paginationQuerySchema } from "../../utils/pagination";
import { updateUserSchema, userIdParamSchema } from "./users.schema";
import * as service from "./users.service";

const router: Router = Router();

router.use(authenticate, authorize(Role.ADMIN));

router.get(
  "/",
  validate({ query: paginationQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = paginationQuerySchema.parse(req.query);
    const { items, pagination } = await service.listUsers(query);
    res.json(ApiResponse.paginated(items, pagination));
  }),
);

router.get(
  "/:id",
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    const user = await service.getUserById(getParam(req, "id"));
    res.json(ApiResponse.success(user));
  }),
);

router.patch(
  "/:id",
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await service.updateUser(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(user));
  }),
);

router.delete(
  "/:id",
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteUser(getParam(req, "id"));
    res.status(204).send();
  }),
);

export default router;
