import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectPrisma } from "./config/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down server...");
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    await disconnectPrisma();
    logger.info("Shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Force exiting after 10s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  shutdown("uncaughtException");
});
