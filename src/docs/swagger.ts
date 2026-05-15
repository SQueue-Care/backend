import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

export function setupSwagger(app: Express): void {
  app.get("/api/v1/docs.json", (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
}
