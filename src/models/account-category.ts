import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountCategoryType = "expense" | "payment";

export type AccountCategoryRecord = {
  name: string;
  type: AccountCategoryType;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
};

const accountCategorySchema = new Schema<AccountCategoryRecord>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  type: { type: String, enum: ["expense", "payment"], required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: true } });

accountCategorySchema.index({ type: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export const AccountCategory: Model<AccountCategoryRecord> =
  (models.AccountCategory as Model<AccountCategoryRecord> | undefined) ??
  model<AccountCategoryRecord>("AccountCategory", accountCategorySchema);
