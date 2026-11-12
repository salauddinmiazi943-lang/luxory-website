import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountAccessRecord = {
  userId: Types.ObjectId;
  grantedBy?: Types.ObjectId;
  grantedAt?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
};

const accountAccessSchema = new Schema<AccountAccessRecord>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true },
  grantedBy: { type: Schema.Types.ObjectId, ref: "User" },
  grantedAt: Date,
  active: { type: Boolean, required: true, default: false, index: true },
}, { timestamps: true });

accountAccessSchema.index({ active: 1, userId: 1 });

export const AccountAccess: Model<AccountAccessRecord> =
  (models.AccountAccess as Model<AccountAccessRecord> | undefined) ??
  model<AccountAccessRecord>("AccountAccess", accountAccessSchema);
