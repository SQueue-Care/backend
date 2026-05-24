import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("*")
    .transform((v) =>
      v === "*"
        ? true
        : v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  ML_SERVICE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : undefined)),

  LLM_API_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  LLM_API_KEY: z.string().default("any-key"),
  LLM_MODEL: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  CONSULTATION_FEE_DEFAULT: z.coerce.number().int().nonnegative().default(50_000),
  ADMIN_FEE_DEFAULT: z.coerce.number().int().nonnegative().default(10_000),
  BPJS_COPAY_DEFAULT: z.coerce.number().int().nonnegative().default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
