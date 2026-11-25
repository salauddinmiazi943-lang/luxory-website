import { Schema, model, models } from "mongoose";

const partySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ["customer", "supplier"], required: true, index: true },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  address: { type: String, trim: true, maxlength: 500, default: "" },
  openingBalancePaisa: { type: Number, min: 0, default: 0 },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
partySchema.index({ type: 1, name: 1 });

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ["expense", "income"], required: true },
  active: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
categorySchema.index({ type: 1, name: 1 }, { unique: true });

export const accountMethods = ["cash", "bkash", "nagad", "rocket", "bank", "other"] as const;
export const accountTransactionTypes = ["sale", "collection", "purchase", "supplier_payment", "expense", "other_income"] as const;

const auditSchema = new Schema({
  action: { type: String, enum: ["created", "edited", "deleted"], required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  at: { type: Date, required: true, default: Date.now },
  note: { type: String, maxlength: 500, default: "" },
}, { _id: false });

const transactionSchema = new Schema({
  type: { type: String, enum: accountTransactionTypes, required: true, index: true },
  amountPaisa: { type: Number, required: true, min: 1 },
  paidPaisa: { type: Number, required: true, min: 0, default: 0 },
  method: { type: String, enum: accountMethods, required: true },
  partyId: { type: Schema.Types.ObjectId, ref: "AccountParty", default: null, index: true },
  partyName: { type: String, trim: true, maxlength: 120, default: "" },
  categoryId: { type: Schema.Types.ObjectId, ref: "AccountCategory", default: null },
  categoryName: { type: String, trim: true, maxlength: 80, default: "" },
  note: { type: String, trim: true, maxlength: 1000, default: "" },
  date: { type: Date, required: true, index: true },
  deletedAt: { type: Date, default: null, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  audit: { type: [auditSchema], default: [] },
}, { timestamps: true });
transactionSchema.index({ date: 1, type: 1, deletedAt: 1 });
transactionSchema.index({ partyId: 1, date: 1, deletedAt: 1 });

const openingSchema = new Schema({
  date: { type: String, required: true },
  method: { type: String, enum: accountMethods, required: true },
  amountPaisa: { type: Number, required: true, min: 0 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
openingSchema.index({ date: 1, method: 1 }, { unique: true });

const accessSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  grantedAt: { type: Date, required: true, default: Date.now },
  active: { type: Boolean, required: true, default: false, index: true },
}, { timestamps: true });

export const AccountParty = models.AccountParty || model("AccountParty", partySchema);
export const AccountCategory = models.AccountCategory || model("AccountCategory", categorySchema);
export const AccountTransaction = models.AccountTransaction || model("AccountTransaction", transactionSchema);
export const AccountOpening = models.AccountOpening || model("AccountOpening", openingSchema);
export const AccountAccess = models.AccountAccess || model("AccountAccess", accessSchema);
