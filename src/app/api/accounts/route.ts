import mongoose from "mongoose";
import { requireAccountsAdmin, isResponse } from "@/lib/accounts/admin";
import { getDailyAccountsData, parseDhakaDate } from "@/lib/accounts/ledger";
import { prepareTransactionInput } from "@/lib/accounts/transactions";
import { connectDb } from "@/lib/db";
import { AccountTransaction } from "@/models/account-transaction";

function responseError(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "হিসাবের অনুরোধ সম্পন্ন হয়নি।" }, { status });
}

function todayInDhaka() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const date = new URL(request.url).searchParams.get("date") ?? todayInDhaka();
    parseDhakaDate(date);
    return Response.json(await getDailyAccountsData(date), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return responseError(error, 400);
  }
}

export async function POST(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const body = await request.json() as Record<string, unknown>;
    const requestKey = typeof body.requestKey === "string" ? body.requestKey : "";
    if (!/^[0-9a-f-]{36}$/i.test(requestKey)) throw new Error("Request key সঠিক নয়; পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।");
    const existing = await AccountTransaction.findOne({ idempotencyKey: requestKey }).select("+idempotencyKey").lean();
    if (existing) return Response.json({ item: existing, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
    const transaction = await prepareTransactionInput(body);
    let created;
    try {
      created = await AccountTransaction.create({ ...transaction, idempotencyKey: requestKey, createdBy: new mongoose.Types.ObjectId(access.user.id) });
    } catch (error) {
      const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
      if (!duplicate) throw error;
      const raced = await AccountTransaction.findOne({ idempotencyKey: requestKey }).select("+idempotencyKey").lean();
      if (!raced) throw error;
      return Response.json({ item: raced, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ item: created.toObject() }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error, 400);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!mongoose.isValidObjectId(id)) throw new Error("লেনদেনের নম্বর সঠিক নয়।");
    if (reason.length < 3) throw new Error("সম্পাদনার কারণ লিখুন (কমপক্ষে ৩ অক্ষর)।");
    const current = await AccountTransaction.findOne({ _id: id, voidedAt: { $exists: false } }).lean();
    if (!current) return Response.json({ error: "লেনদেনটি পাওয়া যায়নি বা বাতিল করা হয়েছে।" }, { status: 404 });
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (current.revision ?? 0)) return Response.json({ error: "এই হিসাবটি অন্য Admin পরিবর্তন করেছেন; নতুন তথ্য লোড করে আবার সম্পাদনা করুন।" }, { status: 409 });
    const dateText = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(current.date));
    const candidate = await prepareTransactionInput({
      ...body,
      type: current.type,
      date: body.date ?? dateText,
      amount: body.amount ?? current.amount,
      paidAmount: body.paidAmount ?? current.paidAmount,
      paymentMethod: body.paymentMethod ?? current.paymentMethod,
      partyId: Object.hasOwn(body, "partyId") ? body.partyId : current.partyId ? String(current.partyId) : "",
      categoryId: Object.hasOwn(body, "categoryId") ? body.categoryId : current.category ? String(current.category) : "",
      partyName: body.partyName ?? current.partyName,
      note: body.note ?? current.note,
      balanceSide: body.balanceSide ?? current.balanceSide,
    });
    const before = {
      date: current.date, amount: current.amount, paidAmount: current.paidAmount, dueAmount: current.dueAmount,
      category: current.category, partyId: current.partyId, partyName: current.partyName,
      paymentMethod: current.paymentMethod, note: current.note, balanceSide: current.balanceSide,
    };
    const revision = current.revision ?? 0;
    const updated = await AccountTransaction.updateOne(
      { _id: current._id, voidedAt: { $exists: false }, $or: [{ revision }, { revision: { $exists: false } }] },
      { $set: { ...candidate, revision: revision + 1 }, $push: { editHistory: { changedAt: new Date(), changedBy: new mongoose.Types.ObjectId(access.user.id), reason, before } } },
      { runValidators: true },
    );
    if (updated.modifiedCount !== 1) return Response.json({ error: "লেনদেনটি একই সময়ে বদলেছে; আবার তথ্য লোড করে চেষ্টা করুন।" }, { status: 409 });
    return Response.json({ ok: true, revision: revision + 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error, 400);
  }
}

export async function DELETE(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!mongoose.isValidObjectId(id)) throw new Error("লেনদেনের নম্বর সঠিক নয়।");
    if (reason.length < 3) throw new Error("বাতিলের কারণ লিখুন (কমপক্ষে ৩ অক্ষর)।");
    const current = await AccountTransaction.findOne({ _id: id, voidedAt: { $exists: false } }).lean();
    if (!current) return Response.json({ error: "লেনদেনটি পাওয়া যায়নি বা আগেই বাতিল হয়েছে।" }, { status: 404 });
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== (current.revision ?? 0)) return Response.json({ error: "এই হিসাবটি অন্য Admin পরিবর্তন করেছেন; নতুন তথ্য লোড করে আবার চেষ্টা করুন।" }, { status: 409 });
    const revision = current.revision ?? 0;
    const result = await AccountTransaction.updateOne(
      { _id: current._id, voidedAt: { $exists: false }, $or: [{ revision }, { revision: { $exists: false } }] },
      { $set: { voidedAt: new Date(), voidedBy: new mongoose.Types.ObjectId(access.user.id), voidReason: reason, revision: revision + 1 }, $push: { editHistory: { changedAt: new Date(), changedBy: new mongoose.Types.ObjectId(access.user.id), reason: `বাতিল: ${reason}`, before: { type: current.type, date: current.date, amount: current.amount, paidAmount: current.paidAmount, dueAmount: current.dueAmount, partyId: current.partyId, partyName: current.partyName, paymentMethod: current.paymentMethod, balanceSide: current.balanceSide } } } },
    );
    if (result.modifiedCount !== 1) return Response.json({ error: "লেনদেনটি একই সময়ে বদলেছে; আবার চেষ্টা করুন।" }, { status: 409 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error, 400);
  }
}
