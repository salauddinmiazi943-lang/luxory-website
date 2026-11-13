import { z } from "zod";
import { connectDb } from "@/lib/db";
import { accountsApiUser } from "@/lib/accounts/access";
import { AccountCategory } from "@/models/accounts";

const schema = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(["income", "expense"]) });
export async function GET() {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  try { await connectDb(); return Response.json({ items: await AccountCategory.find({ active: true }).sort({ type: 1, name: 1 }).lean() }); }
  catch { return Response.json({ error: "খাতের তালিকা আনা যায়নি" }, { status: 503 }); }
}
export async function POST(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য যাচাই করুন" }, { status: 400 });
    await connectDb();
    const item = await AccountCategory.create({ ...parsed.data, createdBy: auth.user!.id });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return Response.json({ error: "এই খাতটি আগে থেকেই আছে" }, { status: 409 });
    return Response.json({ error: "খাত সংরক্ষণ করা যায়নি" }, { status: 503 });
  }
}
