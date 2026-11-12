import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountPasswordResetPurpose = "forgot_password" | "password_change" | "session_revocation";

export type AccountPasswordResetRecord = {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  purpose: AccountPasswordResetPurpose;
  createdAt: Date;
};

const accountPasswordResetSchema = new Schema<AccountPasswordResetRecord>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  tokenHash: { type: String, required: true, unique: true, select: false, immutable: true },
  expiresAt: { type: Date, required: true, index: true },
  used: { type: Boolean, required: true, default: false, index: true },
  purpose: { type: String, enum: ["forgot_password", "password_change", "session_revocation"], required: true, default: "forgot_password" },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false });

accountPasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountPasswordResetSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

export const AccountPasswordReset: Model<AccountPasswordResetRecord> =
  (models.AccountPasswordReset as Model<AccountPasswordResetRecord> | undefined) ??
  model<AccountPasswordResetRecord>("AccountPasswordReset", accountPasswordResetSchema);
