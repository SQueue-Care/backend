import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authLimiter } from "../../middleware/rate-limit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/async-handler";
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from "./auth.controller";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema";

const router: Router = Router();

router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(registerHandler),
);

router.post("/login", authLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));

router.post("/refresh", validate({ body: refreshSchema }), asyncHandler(refreshHandler));

router.post("/logout", validate({ body: refreshSchema }), asyncHandler(logoutHandler));

router.get("/me", authenticate, asyncHandler(meHandler));

export default router;
