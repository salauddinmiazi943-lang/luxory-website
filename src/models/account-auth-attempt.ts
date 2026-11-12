import { Schema, model, models } from "mongoose";
import type { Model } from "mongoose";

export type AccountAuthAttemptRecord = {
  keyHash: string;
  failedAttempts: number;
  windowStartedAt: Date;
  blockedUntil?: Date | null;
  updatedAt: Date;
};

const accountAuthAttemptSchema = new Schema<AccountAuthAttemptRecord>({
  keyHash: { type: String, required: true, unique: true, select: false },
  failedAttempts: { type: Number, required: true, min: 0, default: 0 },
  windowStartedAt: { type: Date, required: true, default: Date.now },
  blockedUntil: Date,
  updatedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false });

accountAuthAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86_400 });

export const AccountAuthAttempt: Model<AccountAuthAttemptRecord> =
  (models.AccountAuthAttempt as Model<AccountAuthAttemptRecord> | undefined) ??
  model<AccountAuthAttemptRecord>("AccountAuthAttempt", accountAuthAttemptSchema);
