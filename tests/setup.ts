process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "test-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-at-least-32-characters";
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? "15m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? "7d";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/test";
