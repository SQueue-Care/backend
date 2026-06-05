import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { waitTimeQuerySchema } from "./predictions.schema";
import { estimateWaitTime } from "./predictions.service";

const router: Router = Router();

router.get(
  "/wait-time",
  authenticate,
  validate({ query: waitTimeQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = waitTimeQuerySchema.parse(req.query);
    const estimate = await estimateWaitTime(query);
    res.json(ApiResponse.success(estimate));
  }),
);

export default router;
