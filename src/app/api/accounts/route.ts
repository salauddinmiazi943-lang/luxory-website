import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { AccountCategory, AccountParty, AccountTransaction, accountMethods, accountTransactionTypes } from "@/models/accounts";
import { accountsApiUser, bangladeshToday, endOfDay, isValidDateOnly, startOfDay } from "@/lib/accounts/access";

const schema = z.object({
  type: z.enum(accountTransactionTypes), date: z.string().refine(isValidDateOnly, "তারিখটি সঠিক নয়"),
  amount: z.number().finite().positive().max(1_000_000_000), paid: z.number().finite().min(0).max(1_000_000_000).default(0),
  method: z.enum(accountMethods), partyId: z.string().optional().nullable(), categoryId: z.string().optional().nullable(),
  note: z.string().max(1000).default(""),
}).superRefine((value, ctx) => {
  if (["sale", "purchase"].includes(value.type) && value.paid > value.amount) ctx.addIssue({ code: "custom", path: ["paid"], message: "জমার টাকা মোট টাকার বেশি হতে পারবে না" });
  if (["sale", "collection", "purchase", "supplier_payment"].includes(value.type) && !value.partyId) ctx.addIssue({ code: "custom", path: ["partyId"], message: "পার্টি নির্বাচন করুন" });
  if (value.type === "sale" && value.partyId && value.paid > value.amount) ctx.addIssue({ code: "custom", path: ["paid"], message: "জমার পরিমাণ মোট টাকার বেশি হতে পারবে না" });
});

export async function GET(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isValidDateOnly(date)) return Response.json({ error: "সঠিক তারিখ দিন" }, { status: 400 });
  const type = url.searchParams.get("type");
  const method = url.searchParams.get("method");
  const partyId = url.searchParams.get("partyId");
  const categoryId = url.searchParams.get("categoryId");
  const filter: Record<string, unknown> = { date: { $gte: startOfDay(date), $lte: endOfDay(date) }, deletedAt: null };
  if (type && (accountTransactionTypes as readonly string[]).includes(type)) filter.type = type;
  if (method && (accountMethods as readonly string[]).includes(method)) filter.method = method;
  if (partyId && mongoose.isValidObjectId(partyId)) filter.partyId = new mongoose.Types.ObjectId(partyId);
  if (categoryId && mongoose.isValidObjectId(categoryId)) filter.categoryId = new mongoose.Types.ObjectId(categoryId);
  try {
    await connectDb();
    const [items, totals] = await Promise.all([
      AccountTransaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(500).lean(),
      AccountTransaction.aggregate([
        { $match: { date: { $gte: startOfDay(date), $lte: endOfDay(date) }, deletedAt: null } },
        { $group: { _id: "$type", amount: { $sum: "$amountPaisa" }, paid: { $sum: "$paidPaisa" }, count: { $sum: 1 } } },
      ]),
    ]);
    return Response.json({ items, totals });
  } catch {
    return Response.json({ error: "দৈনিক হিসাব লোড করা যায়নি" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য যাচাই করুন" }, { status: 400 });
    const data = parsed.data;
    if (data.date > bangladeshToday()) return Response.json({ error: "ভবিষ্যতের তারিখে হিসাব যোগ করা যাবে না" }, { status: 400 });
    if (["sale", "collection"].includes(data.type) && data.partyId && !mongoose.isValidObjectId(data.partyId)) return Response.json({ error: "গ্রাহক নির্বাচন সঠিক নয়" }, { status: 400 });
    if (["purchase", "supplier_payment"].includes(data.type) && data.partyId && !mongoose.isValidObjectId(data.partyId)) return Response.json({ error: "সরবরাহকারী নির্বাচন সঠিক নয়" }, { status: 400 });
    if (data.categoryId && !mongoose.isValidObjectId(data.categoryId)) return Response.json({ error: "খাত নির্বাচন সঠিক নয়" }, { status: 400 });
    await connectDb();
    let partyName = "";
    if (data.partyId) {
      const party = await AccountParty.findOne({ _id: data.partyId, active: true }).select("name type").lean();
      const wanted = ["sale", "collection"].includes(data.type) ? "customer" : "supplier";
      if (!party || party.type !== wanted) return Response.json({ error: wanted === "customer" ? "সঠিক গ্রাহক নির্বাচন করুন" : "সঠিক সরবরাহকারী নির্বাচন করুন" }, { status: 400 });
      partyName = party.name;
    }
    let categoryName = "";
    if (data.categoryId) {
      const category = await AccountCategory.findOne({ _id: data.categoryId, active: true }).select("name type").lean();
      const wanted = ["expense", "supplier_payment", "purchase"].includes(data.type) ? "expense" : "income";
      if (!category || category.type !== wanted) return Response.json({ error: "লেনদেনের ধরনের সঙ্গে মিল আছে এমন খাত নির্বাচন করুন" }, { status: 400 });
      categoryName = category.name;
    }
    const amountPaisa = Math.round(data.amount * 100);
    const paidPaisa = Math.round(data.paid * 100);
    const item = await AccountTransaction.create({
      type: data.type, amountPaisa, paidPaisa, method: data.method,
      partyId: data.partyId || null, partyName, categoryId: data.categoryId || null, categoryName,
      note: data.note.trim(), date: startOfDay(data.date), createdBy: auth.user!.id, updatedBy: auth.user!.id,
      audit: [{ action: "created", actorId: auth.user!.id, note: "নতুন হিসাব" }],
    });
    return Response.json({ item }, { status: 201 });
  } catch {
    return Response.json({ error: "হিসাব সংরক্ষণ করা যায়নি" }, { status: 503 });
  }
}
