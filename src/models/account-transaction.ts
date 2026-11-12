import { Schema, model, models } from "mongoose";
import type { Model, Types } from "mongoose";

export type AccountTransactionType = "sale" | "due_collection" | "purchase" | "expense" | "payment" | "opening_balance";
export type AccountPaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "other";
export type AccountBalanceSide = "cash" | "receivable" | "payable";
export type AccountTransactionEdit = { changedAt: Date; changedBy: Types.ObjectId; reason: string; before: Record<string, unknown> };

export type AccountTransactionRecord = {
  type: AccountTransactionType;
  amount: number;
  paidAmount: number;
  dueAmount: number;
  category?: Types.ObjectId;
  partyId?: Types.ObjectId;
  partyName: string;
  paymentMethod: AccountPaymentMethod;
  balanceSide?: AccountBalanceSide;
  note?: string;
  date: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  revision: number;
  idempotencyKey?: string;
  editHistory: AccountTransactionEdit[];
  voidedAt?: Date;
  voidedBy?: Types.ObjectId;
  voidReason?: string;
};

const accountTransactionEditSchema = new Schema<AccountTransactionEdit>({
  changedAt: { type: Date, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, required: true, maxlength: 500 },
  before: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const accountTransactionSchema = new Schema<AccountTransactionRecord>({
  type: { type: String, enum: ["sale", "due_collection", "purchase", "expense", "payment", "opening_balance"], required: true, index: true, immutable: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAmount: { type: Number, required: true, min: 0, default: 0 },
  dueAmount: { type: Number, required: true, min: 0, default: 0 },
  category: {
    type: Schema.Types.ObjectId,
    ref: "AccountCategory",
    required: function (this: AccountTransactionRecord) { return this.type === "expense" || this.type === "payment"; },
    immutable: false,
  },
  partyId: { type: Schema.Types.ObjectId, ref: "AccountParty", index: true },
  partyName: { type: String, required: true, trim: true, maxlength: 160 },
  paymentMethod: { type: String, enum: ["cash", "bkash", "nagad", "rocket", "bank", "other"], required: true, default: "other" },
  balanceSide: { type: String, enum: ["cash", "receivable", "payable"] },
  note: { type: String, trim: true, maxlength: 2000 },
  date: { type: Date, required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true },
  revision: { type: Number, required: true, min: 0, default: 0 },
  idempotencyKey: { type: String, trim: true, maxlength: 80, immutable: true, select: false },
  editHistory: { type: [accountTransactionEditSchema], default: [] },
  voidedAt: Date,
  voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
  voidReason: { type: String, trim: true, maxlength: 500 },
}, { versionKey: false });

accountTransactionSchema.index({ date: -1, type: 1 });
accountTransactionSchema.index({ partyId: 1, date: -1, createdAt: -1 });
accountTransactionSchema.index({ category: 1, date: -1 });
accountTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

accountTransactionSchema.pre("validate", function () {
  if (this.type === "purchase" && Math.abs(this.amount - this.paidAmount - this.dueAmount) > 0.011) {
    this.invalidate("dueAmount", "Purchase total must equal paid amount plus due amount.");
  }
  if (this.type === "opening_balance" && !this.balanceSide) {
    this.invalidate("balanceSide", "Opening balance type is required.");
  }
  if (this.type === "opening_balance" && this.balanceSide !== "cash" && !this.partyId) {
    this.invalidate("partyId", "Party is required for receivable/payable opening balances.");
  }
  if (this.type === "opening_balance" && this.balanceSide === "cash" && this.partyId) {
    this.invalidate("partyId", "Cash opening balance cannot be assigned to a party.");
  }
  if (this.type === "sale" && Math.abs(this.amount - this.paidAmount - this.dueAmount) > 0.011) {
    this.invalidate("dueAmount", "বিক্রির মোট টাকা = আদায় + বাকি হতে হবে।");
  }
  if (this.type === "due_collection" && this.dueAmount !== 0) {
    this.invalidate("dueAmount", "বাকি আদায়ের এন্ট্রিতে নতুন বাকি থাকা যাবে না।");
  }
});

export const AccountTransaction: Model<AccountTransactionRecord> =
  (models.AccountTransaction as Model<AccountTransactionRecord> | undefined) ??
  model<AccountTransactionRecord>("AccountTransaction", accountTransactionSchema);
