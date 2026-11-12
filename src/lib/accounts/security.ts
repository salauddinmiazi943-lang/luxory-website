import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { AccountSecurityState } from "@/models/account-security-state";

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
export const ACCOUNT_AUTH_MAX_FAILURES = 5;
export const ACCOUNT_AUTH_BLOCK_MS = 15 * 60 * 1000;

export function createOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashOneTimeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function invalidateAccountSessions(userId: string | mongoose.Types.ObjectId) {
  await connectDb();
  const objectId = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
  await AccountSecurityState.updateOne(
    { userId: objectId },
    { $inc: { sessionVersion: 1 }, $setOnInsert: { mustChangePassword: false } },
    { upsert: true },
  );
}

export async function setPasswordChangeRequired(userId: string | mongoose.Types.ObjectId, required: boolean) {
  await connectDb();
  const objectId = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
  await AccountSecurityState.updateOne(
    { userId: objectId },
    { $set: { mustChangePassword: required }, $setOnInsert: { sessionVersion: 0 } },
    { upsert: true },
  );
}

export async function accountSessionIsCurrent(userId: string, sessionVersion = 0) {
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) return false;
  await connectDb();
  const state = await AccountSecurityState.findOne({ userId }).select("sessionVersion").lean();
  return (state?.sessionVersion ?? 0) === sessionVersion;
}
