import bcrypt from "bcrypt";
import crypto from "node:crypto";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** SHA-256 hash used to store refresh tokens safely. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
