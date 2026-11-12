import mongoose from "mongoose";
import { AccountCategory } from "@/models/account-category";
import { AccountParty } from "@/models/account-party";
import type { AccountBalanceSide, AccountPaymentMethod, AccountTransactionType } from "@/models/account-transaction";
import { parseDhakaDate } from "@/lib/accounts/ledger";

const transactionTypes: AccountTransactionType[] = ["sale", "due_collection", "purchase", "expense", "payment", "opening_balance"];
const paymentMethods: AccountPaymentMethod[] = ["cash", "bkash", "nagad", "rocket", "bank", "other"];

export type TransactionInput = {
  type: AccountTransactionType;
  amount: number;
  paidAmount: number;
  dueAmount: number;
  date: Date;
  paymentMethod: AccountPaymentMethod;
  category?: mongoose.Types.ObjectId;
  partyId?: mongoose.Types.ObjectId;
  partyName: string;
  note?: string;
  balanceSide?: AccountBalanceSide;
};

export async function prepareTransactionInput(body: Record<string, unknown>): Promise<TransactionInput> {
  const type = body.type;
  if (typeof type !== "string" || !transactionTypes.includes(type as AccountTransactionType)) throw new Error("লেনদেনের ধরন সঠিক নয়।");
  const transactionType = type as AccountTransactionType;
  const rawAmount = Number(body.amount);
  const rawPaid = transactionType === "sale" || transactionType === "purchase"
    ? Number(body.paidAmount ?? 0)
    : transactionType === "opening_balance" ? 0 : rawAmount;
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 1_000_000_000_000) throw new Error("টাকার পরিমাণ সঠিক নয়।");
  if (!Number.isFinite(rawPaid) || rawPaid < 0 || rawPaid > rawAmount) throw new Error("পরিশোধিত টাকার পরিমাণ মোট টাকার মধ্যে হতে হবে।");
  const amount = Math.round(rawAmount * 100) / 100;
  const paidAmount = Math.round(rawPaid * 100) / 100;
  const dueAmount = transactionType === "sale" || transactionType === "purchase" ? Math.round((amount - paidAmount) * 100) / 100 : 0;
  if (typeof body.date !== "string") throw new Error("তারিখ দিতে হবে।");
  const date = parseDhakaDate(body.date);
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod as AccountPaymentMethod : "cash";
  if (!paymentMethods.includes(paymentMethod)) throw new Error("পেমেন্ট মাধ্যম সঠিক নয়।");
  const balanceSide = typeof body.balanceSide === "string" ? body.balanceSide as AccountBalanceSide : undefined;
  if (transactionType === "opening_balance" && !["cash", "receivable", "payable"].includes(balanceSide ?? "")) throw new Error("Opening balance-এর ধরন নির্বাচন করুন।");

  let partyId: mongoose.Types.ObjectId | undefined;
  let partyName = typeof body.partyName === "string" ? body.partyName.trim().slice(0, 160) : "";
  const rawPartyId = typeof body.partyId === "string" ? body.partyId : "";
  const partyRequired = transactionType === "due_collection" || transactionType === "purchase" || transactionType === "payment" ||
    (transactionType === "sale" && dueAmount > 0) ||
    (transactionType === "opening_balance" && balanceSide !== "cash");
  if (rawPartyId) {
    if (!mongoose.isValidObjectId(rawPartyId)) throw new Error("পার্টি নির্বাচন সঠিক নয়।");
    partyId = new mongoose.Types.ObjectId(rawPartyId);
    const party = await AccountParty.findById(partyId).select("name type").lean();
    if (!party) throw new Error("নির্বাচিত পার্টি পাওয়া যায়নি।");
    const allowedType = transactionType === "sale" || transactionType === "due_collection" || (transactionType === "opening_balance" && balanceSide === "receivable")
      ? "customer"
      : transactionType === "purchase" || transactionType === "payment" || (transactionType === "opening_balance" && balanceSide === "payable")
        ? "supplier"
        : undefined;
    if (allowedType && party.type !== allowedType) throw new Error(allowedType === "customer" ? "এই লেনদেনের জন্য Customer নির্বাচন করুন।" : "এই লেনদেনের জন্য Supplier নির্বাচন করুন।");
    partyName = party.name;
  } else if (partyRequired) {
    throw new Error("এই লেনদেনের জন্য সংশ্লিষ্ট Customer বা Supplier নির্বাচন করতে হবে।");
  }
  if (transactionType === "opening_balance" && balanceSide === "cash" && rawPartyId) throw new Error("Cash opening balance-এ কোনো party নির্বাচন করবেন না।");
  if (!partyName) partyName = transactionType === "sale" ? "নগদ বিক্রি" : transactionType === "expense" ? "অন্যান্য" : "নাম দেওয়া হয়নি";

  let category: mongoose.Types.ObjectId | undefined;
  const categoryRequired = transactionType === "expense" || transactionType === "payment";
  const rawCategoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  if (rawCategoryId) {
    if (!mongoose.isValidObjectId(rawCategoryId)) throw new Error("খাত নির্বাচন সঠিক নয়।");
    category = new mongoose.Types.ObjectId(rawCategoryId);
    const categoryType = transactionType === "expense" ? "expense" : transactionType === "payment" ? "payment" : undefined;
    const exists = await AccountCategory.exists({ _id: category, ...(categoryType ? { type: categoryType } : {}) });
    if (!exists) throw new Error("নির্বাচিত খাত পাওয়া যায়নি বা এই লেনদেনের সঙ্গে মেলে না।");
  } else if (categoryRequired) {
    throw new Error("এই লেনদেনের জন্য খাত নির্বাচন করতে হবে।");
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  return { type: transactionType, amount, paidAmount, dueAmount, date, paymentMethod, category, partyId, partyName, note: note || undefined, balanceSide };
}
