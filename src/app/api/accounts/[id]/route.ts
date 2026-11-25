import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { accountsApiUser, bangladeshToday, isValidDateOnly, startOfDay } from "@/lib/accounts/access";
import { AccountCategory, AccountParty, AccountTransaction, accountMethods } from "@/models/accounts";

const updateSchema = z.object({
  date: z.string().refine(isValidDateOnly),
  amount: z.number().finite().positive().max(1_000_000_000), paid: z.number().finite().min(0).max(1_000_000_000),
  method: z.enum(accountMethods), note: z.string().max(1000).default(""),
  partyId: z.string().nullable().optional(), categoryId: z.string().nullable().optional(),
}).refine((value) => value.paid <= value.amount, { message: "জমা মোট টাকার বেশি হতে পারবে না", path: ["paid"] });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return Response.json({ error: "হিসাব পাওয়া যায়নি" }, { status: 404 });
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য যাচাই করুন" }, { status: 400 });
    if (parsed.data.date > bangladeshToday()) return Response.json({ error: "ভবিষ্যতের তারিখ গ্রহণযোগ্য নয়" }, { status: 400 });
    if (parsed.data.partyId && !mongoose.isValidObjectId(parsed.data.partyId)) return Response.json({ error: "পার্টি নির্বাচন সঠিক নয়" }, { status: 400 });
    if (parsed.data.categoryId && !mongoose.isValidObjectId(parsed.data.categoryId)) return Response.json({ error: "খাত নির্বাচন সঠিক নয়" }, { status: 400 });
    await connectDb();
    const existing = await AccountTransaction.findOne({ _id: id, deletedAt: null }).select("type").lean() as { type: string } | null;
    if (!existing) return Response.json({ error: "হিসাব পাওয়া যায়নি" }, { status: 404 });
    const updates: Record<string, unknown> = { date: startOfDay(parsed.data.date), amountPaisa: Math.round(parsed.data.amount * 100), paidPaisa: Math.round(parsed.data.paid * 100), method: parsed.data.method, note: parsed.data.note.trim(), updatedBy: auth.user!.id };
    if (parsed.data.partyId !== undefined) {
      if (parsed.data.partyId) {
        const party = await AccountParty.findOne({ _id: parsed.data.partyId, active: true }).select("name type").lean() as { _id: mongoose.Types.ObjectId; name: string; type: string } | null;
        const wanted = ["sale", "collection"].includes(existing.type) ? "customer" : "supplier";
        if (!party || party.type !== wanted) return Response.json({ error: wanted === "customer" ? "সঠিক গ্রাহক নির্বাচন করুন" : "সঠিক সরবরাহকারী নির্বাচন করুন" }, { status: 400 });
        updates.partyId = party._id; updates.partyName = party.name;
      } else { updates.partyId = null; updates.partyName = ""; }
    }
    if (parsed.data.categoryId !== undefined) {
      if (parsed.data.categoryId) {
        const category = await AccountCategory.findOne({ _id: parsed.data.categoryId, active: true }).select("name type").lean() as { _id: mongoose.Types.ObjectId; name: string; type: string } | null;
        const wanted = ["expense", "supplier_payment", "purchase"].includes(existing.type) ? "expense" : "income";
        if (!category || category.type !== wanted) return Response.json({ error: "লেনদেনের ধরনের সঙ্গে মিল আছে এমন খাত নির্বাচন করুন" }, { status: 400 });
        updates.categoryId = category._id; updates.categoryName = category.name;
      } else { updates.categoryId = null; updates.categoryName = ""; }
    }
    const item = await AccountTransaction.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: updates, $push: { audit: { action: "edited", actorId: auth.user!.id, at: new Date(), note: "হিসাব সম্পাদনা" } } },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return Response.json({ error: "হিসাব পাওয়া যায়নি" }, { status: 404 });
    return Response.json({ item });
  } catch {
    return Response.json({ error: "হিসাব পরিবর্তন করা যায়নি" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  if (!auth.user!.accountsAdmin) return Response.json({ error: "শুধু অ্যাডমিন হিসাব বাতিল করতে পারবেন" }, { status: 403 });
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return Response.json({ error: "হিসাব পাওয়া যায়নি" }, { status: 404 });
  try {
    await connectDb();
    const item = await AccountTransaction.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: { deletedAt: new Date(), updatedBy: auth.user!.id }, $push: { audit: { action: "deleted", actorId: auth.user!.id, at: new Date(), note: "হিসাব বাতিল (soft delete)" } } }, { new: true }).select("_id").lean();
    if (!item) return Response.json({ error: "হিসাব পাওয়া যায়নি" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "হিসাব বাতিল করা যায়নি" }, { status: 503 });
  }
}
