import mongoose from "mongoose";
import { requireAccountsAdmin, isResponse } from "@/lib/accounts/admin";
import { connectDb } from "@/lib/db";
import { AccountCategory } from "@/models/account-category";

export async function GET() {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const categories = await AccountCategory.find({}).sort({ type: 1, name: 1 }).lean();
    return Response.json({ categories }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "খাতের তালিকা পাওয়া যায়নি।" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = body.type;
    if (!name || name.length > 100 || (type !== "expense" && type !== "payment")) {
      return Response.json({ error: "খাতের নাম ও ধরন সঠিকভাবে দিন।" }, { status: 400 });
    }
    const category = await AccountCategory.create({ name, type, createdBy: new mongoose.Types.ObjectId(access.user.id) });
    return Response.json({ category }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
    return Response.json({ error: duplicate ? "এই ধরনের একই নামের খাত আগে থেকেই আছে।" : "খাত সংরক্ষণ হয়নি।" }, { status: 400 });
  }
}
