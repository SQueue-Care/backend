import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { setupSwagger } from "./docs/swagger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { apiLimiter } from "./middleware/rate-limit.middleware";
import { requestLogger } from "./middleware/request-logger";
import apiRouter from "./routes";
import { ApiResponse } from "./utils/api-response";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS as cors.CorsOptions["origin"],
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.json(ApiResponse.success({ status: "ok", uptime: process.uptime() }));
  });

  app.get("/ready", (_req, res) => {
    res.json(ApiResponse.success({ ready: true }));
  });

  setupSwagger(app);

  app.use("/api/v1", apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
