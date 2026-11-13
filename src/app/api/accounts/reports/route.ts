import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { accountsApiUser, bangladeshToday, endOfDay, isValidDateOnly, startOfDay } from "@/lib/accounts/access";
import { AccountTransaction } from "@/models/accounts";

export async function GET(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  if (!isValidDateOnly(from) || !isValidDateOnly(to) || from > to || to > bangladeshToday()) return Response.json({ error: "তারিখের সীমা সঠিক নয়" }, { status: 400 });
  const match: Record<string, unknown> = { date: { $gte: startOfDay(from), $lte: endOfDay(to) }, deletedAt: null };
  const categoryId = url.searchParams.get("categoryId");
  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) return Response.json({ error: "খাত নির্বাচন সঠিক নয়" }, { status: 400 });
    match.categoryId = new mongoose.Types.ObjectId(categoryId);
  }
  try {
    await connectDb();
    const [summary, byDay, byCategory, byMethod] = await Promise.all([
      AccountTransaction.aggregate([{ $match: match }, { $group: { _id: "$type", amountPaisa: { $sum: "$amountPaisa" }, paidPaisa: { $sum: "$paidPaisa" }, count: { $sum: 1 } } }]),
      AccountTransaction.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Dhaka" } }, sales: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$amountPaisa", 0] } }, income: { $sum: { $cond: [{ $eq: ["$type", "other_income"] }, "$amountPaisa", 0] } }, costs: { $sum: { $cond: [{ $in: ["$type", ["purchase", "expense"]] }, "$amountPaisa", 0] } } } }, { $sort: { _id: 1 } }]),
      AccountTransaction.aggregate([{ $match: { ...match, type: "expense" } }, { $group: { _id: { name: "$categoryName", id: "$categoryId" }, amountPaisa: { $sum: "$amountPaisa" } } }, { $sort: { amountPaisa: -1 } }]),
      AccountTransaction.aggregate([{ $match: match }, { $group: { _id: "$method", incoming: { $sum: { $cond: [{ $in: ["$type", ["sale", "collection", "other_income"]] }, { $cond: [{ $in: ["$type", ["sale"]] }, "$paidPaisa", "$amountPaisa"] }, 0] } }, outgoing: { $sum: { $cond: [{ $in: ["$type", ["purchase"]] }, "$paidPaisa", { $cond: [{ $in: ["$type", ["supplier_payment", "expense"]] }, "$amountPaisa", 0] }] } } } }]),
    ]);
    return Response.json({ from, to, summary, byDay, byCategory, byMethod, note: "ক্রয়মূল্য ও বিক্রিত পণ্যের COGS আলাদাভাবে সংরক্ষিত নেই; লাভ/লোকসান এখানে বিক্রয়/আয় থেকে ক্রয় ও খরচ বাদ দিয়ে নগদ-ভিত্তিক আনুমানিক হিসাব। এটিকে প্রকৃত পণ্যমুনাফা হিসেবে ধরবেন না।" });
  } catch {
    return Response.json({ error: "রিপোর্ট তৈরি করা যায়নি" }, { status: 503 });
  }
}
