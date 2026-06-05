import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { ApiResponse } from "../utils/api-response";

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(ApiResponse.error("Too many requests, please try again later", "RATE_LIMIT"));
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(
        ApiResponse.error(
          "Too many auth attempts, slow down and try again shortly",
          "RATE_LIMIT_AUTH",
        ),
      );
  },
});
