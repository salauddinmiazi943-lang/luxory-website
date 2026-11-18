import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const PASSWORD_RESET_ROLES = ["super_admin", "admin", "vendor"] as const;
export type PasswordResetRole = (typeof PASSWORD_RESET_ROLES)[number];

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const PASSWORD_RESET_OTP_TTL_MINUTES = 15;
export const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetOtp() {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { otp, hash: hashPasswordResetOtp(otp) };
}

export function hashPasswordResetOtp(otp: string) {
  return createHmac("sha256", process.env.JWT_SECRET ?? "").update(otp).digest("hex");
}

export function passwordResetOtpMatches(otp: string, expectedHash: string) {
  const actual = Buffer.from(hashPasswordResetOtp(otp), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordResetRoleLabel(role: string) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Sub Admin";
  if (role === "vendor") return "Vendor";
  return "Account";
}

