import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { verifyByNik } from "./bpjs.service";

const router: Router = Router();

const nikParam = z.object({
  nik: z.string().regex(/^\d{16}$/, "NIK harus 16 digit angka"),
});

router.get(
  "/verify/:nik",
  authenticate,
  validate({ params: nikParam }),
  asyncHandler(async (req, res) => {
    const result = verifyByNik(getParam(req, "nik"));
    res.json(ApiResponse.success({ ...result, source: "mock" }));
  }),
);

export default router;
