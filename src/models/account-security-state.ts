import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountSecurityStateRecord = {
  userId: Types.ObjectId;
  sessionVersion: number;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt?: Date;
};

const accountSecurityStateSchema = new Schema<AccountSecurityStateRecord>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true },
  sessionVersion: { type: Number, required: true, min: 0, default: 0 },
  mustChangePassword: { type: Boolean, required: true, default: false },
}, { timestamps: true });

export const AccountSecurityState: Model<AccountSecurityStateRecord> =
  (models.AccountSecurityState as Model<AccountSecurityStateRecord> | undefined) ??
  model<AccountSecurityStateRecord>("AccountSecurityState", accountSecurityStateSchema);
