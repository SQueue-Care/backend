import { createApp } from "./app"; //import cron untuk penjadwalan reservasi kadaluarsa
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectPrisma } from "./config/prisma";
import cron from "node-cron";

import { sweepExpiredAppointments } from "./modules/appointments/appointments.service";

const app = createApp();

cron.schedule("0 * * * *", async () => {
  logger.info("Menjalankan tugas penyisiran reservasi kedaluwarsa...");
  try {
    const cancelledCount = await sweepExpiredAppointments();
    if (cancelledCount > 0) {
      logger.info(`Berhasil membatalkan otomatis ${cancelledCount} reservasi kedaluwarsa.`);
    }
  } catch (error) {
    logger.error({ err: error }, "Terjadi kesalahan sistem saat menyapu reservasi.");
  }
});

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
