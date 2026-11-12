import mongoose from "mongoose";
import type { AccountTransactionType } from "@/models/account-transaction";

export function roundBdt(value: number) {
  if (!Number.isFinite(value)) throw new Error("টাকার পরিমাণ সঠিক নয়।");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitSale(amount: number, paidAmount: number) {
  const total = roundBdt(amount);
  const received = roundBdt(paidAmount);
  if (total <= 0 || received < 0 || received > total) throw new Error("বিক্রির মোট ও আদায়ের পরিমাণ যাচাই করুন।");
  return { amount: total, paidAmount: received, dueAmount: roundBdt(total - received) };
}

export function normalizeTransactionAmounts(input: {
  type: AccountTransactionType;
  amount: number;
  paidAmount?: number;
  dueAmount?: number;
}) {
  const amount = roundBdt(input.amount);
  if (amount <= 0) throw new Error("টাকার পরিমাণ শূন্যের বেশি হতে হবে।");

  if (input.type === "sale") return splitSale(amount, input.paidAmount ?? 0);
  if (input.type === "purchase") return splitSale(amount, input.paidAmount ?? 0);
  if (input.type === "due_collection") return { amount, paidAmount: amount, dueAmount: 0 };
  if (input.type === "opening_balance") return { amount, paidAmount: 0, dueAmount: 0 };
  return { amount, paidAmount: amount, dueAmount: 0 };
}

export function validObjectId(value: string) {
  return mongoose.isValidObjectId(value);
}

export function dateRange(from?: string, to?: string) {
  const validateDateOnly = (value: string) => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) throw new Error("Date must use YYYY-MM-DD format.");
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error("Date is not a valid calendar date.");
    }
  };
  if (from) validateDateOnly(from);
  if (to) validateDateOnly(to);
  const start = from ? new Date(`${from}T00:00:00.000+06:00`) : undefined;
  const endExclusive = to ? new Date(new Date(`${to}T00:00:00.000+06:00`).getTime() + 86_400_000) : undefined;
  if ((start && !Number.isFinite(start.getTime())) || (endExclusive && !Number.isFinite(endExclusive.getTime()))) {
    throw new Error("তারিখ সঠিক নয়।");
  }
  if (start && endExclusive && start >= endExclusive) throw new Error("শুরুর তারিখ শেষের তারিখের পরে হতে পারবে না।");
  return { start, endExclusive };
}
