import { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { logger } from "./logger";

const createClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [{ emit: "event", level: "query" }, "info", "warn", "error"]
        : ["warn", "error"],
  });

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };

const globalRef = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = globalRef.__prisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalRef.__prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, "Failed to disconnect Prisma client");
  }
}
