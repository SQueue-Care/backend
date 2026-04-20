import pino from "pino";
import { env } from "./env";

const isProd = env.NODE_ENV === "production";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "healthcare-queue-api" },
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

export type Logger = typeof logger;
