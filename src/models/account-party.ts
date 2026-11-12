import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountPartyType = "customer" | "supplier" | "staff" | "other";

export type AccountPartyRecord = {
  name: string;
  phone?: string;
  type: AccountPartyType;
  address?: string;
  note?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
};

const accountPartySchema = new Schema<AccountPartyRecord>({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, trim: true, maxlength: 30 },
  type: { type: String, enum: ["customer", "supplier", "staff", "other"], required: true, index: true },
  address: { type: String, trim: true, maxlength: 500 },
  note: { type: String, trim: true, maxlength: 2000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: true } });

accountPartySchema.index({ name: 1, type: 1 });

export const AccountParty: Model<AccountPartyRecord> =
  (models.AccountParty as Model<AccountPartyRecord> | undefined) ??
  model<AccountPartyRecord>("AccountParty", accountPartySchema);
