import { createHash } from "node:crypto";
import { connectDb } from "@/lib/db";
import { AccountAuthAttempt } from "@/models/account-auth-attempt";
import { ACCOUNT_AUTH_BLOCK_MS, ACCOUNT_AUTH_MAX_FAILURES } from "@/lib/accounts/security";

const ATTEMPT_WINDOW_MS = ACCOUNT_AUTH_BLOCK_MS;

export function accountAttemptKey(identifier: string, request: Request, scope: string) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const normalized = `${scope}:${identifier.trim().toLowerCase()}:${address}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export async function isAccountAttemptBlocked(keyHash: string, now = new Date()) {
  await connectDb();
  const attempt = await AccountAuthAttempt.findOne({ keyHash }).select("failedAttempts windowStartedAt blockedUntil").lean();
  if (!attempt) return { blocked: false, retryAfterSeconds: 0 };
  if (attempt.blockedUntil && attempt.blockedUntil.getTime() > now.getTime()) {
    return { blocked: true, retryAfterSeconds: Math.ceil((attempt.blockedUntil.getTime() - now.getTime()) / 1000) };
  }
  if (now.getTime() - attempt.windowStartedAt.getTime() >= ATTEMPT_WINDOW_MS) {
    await AccountAuthAttempt.updateOne({ keyHash }, { $set: { failedAttempts: 0, windowStartedAt: now, blockedUntil: null, updatedAt: now } });
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function recordAccountFailure(keyHash: string, now = new Date()) {
  await connectDb();
  for (let retry = 0; retry < 8; retry++) {
    const existing = await AccountAuthAttempt.findOne({ keyHash }).select("failedAttempts windowStartedAt");
    if (!existing) {
      try {
        const blockedUntil = ACCOUNT_AUTH_MAX_FAILURES <= 1 ? new Date(now.getTime() + ACCOUNT_AUTH_BLOCK_MS) : null;
        await AccountAuthAttempt.create({ keyHash, failedAttempts: 1, windowStartedAt: now, blockedUntil, updatedAt: now });
        return { blocked: Boolean(blockedUntil), retryAfterSeconds: blockedUntil ? Math.ceil(ACCOUNT_AUTH_BLOCK_MS / 1000) : 0 };
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) continue;
        throw error;
      }
    }

    const expired = now.getTime() - existing.windowStartedAt.getTime() >= ATTEMPT_WINDOW_MS;
    const failedAttempts = expired ? 1 : existing.failedAttempts + 1;
    const blockedUntil = failedAttempts >= ACCOUNT_AUTH_MAX_FAILURES ? new Date(now.getTime() + ACCOUNT_AUTH_BLOCK_MS) : null;
    const update = await AccountAuthAttempt.updateOne(
      { _id: existing._id, failedAttempts: existing.failedAttempts, windowStartedAt: existing.windowStartedAt },
      { $set: { failedAttempts, windowStartedAt: expired ? now : existing.windowStartedAt, blockedUntil, updatedAt: now } },
    );
    if (update.modifiedCount) return { blocked: Boolean(blockedUntil), retryAfterSeconds: blockedUntil ? Math.ceil(ACCOUNT_AUTH_BLOCK_MS / 1000) : 0 };
  }
  throw new Error("Login attempts could not be recorded safely.");
}

export async function clearAccountFailures(keyHash: string) {
  await connectDb();
  await AccountAuthAttempt.deleteOne({ keyHash });
}
