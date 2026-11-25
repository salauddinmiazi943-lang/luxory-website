import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { User } from "@/lib/models";
import { AccountAccess } from "@/models/accounts";

async function admin() {
  const auth = await requireUser(["super_admin"]);
  if ("error" in auth) return { response: auth.error, user: undefined };
  return { response: undefined, user: auth.user };
}
export async function GET() {
  const auth = await admin();
  if (auth.response) return auth.response;
  try {
    await connectDb();
    const [users, grants] = await Promise.all([
      User.find({ role: "admin", status: "active" }).select("name email role status").sort({ name: 1 }).lean(),
      AccountAccess.find({}).select("userId active grantedAt").lean(),
    ]);
    const map = new Map(grants.map((grant) => [String(grant.userId), grant]));
    return Response.json({ items: users.filter((user) => String(user._id) !== auth.user!.id).map((user) => ({ id: String(user._id), name: user.name, email: user.email, active: map.get(String(user._id))?.active ?? false, grantedAt: map.get(String(user._id))?.grantedAt ?? null })) });
  } catch { return Response.json({ error: "ম্যানেজার তালিকা আনা যায়নি" }, { status: 503 }); }
}

const schema = z.object({ userId: z.string().refine(mongoose.isValidObjectId), active: z.boolean() });
export async function PUT(request: Request) {
  const auth = await admin();
  if (auth.response) return auth.response;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "ম্যানেজারের তথ্য সঠিক নয়" }, { status: 400 });
    await connectDb();
    const member = await User.findOne({ _id: parsed.data.userId, role: "admin", status: "active" }).select("_id").lean();
    if (!member || String(member._id) === auth.user!.id) return Response.json({ error: "এই অ্যাকাউন্টকে ম্যানেজার হিসেবে যোগ করা যাবে না" }, { status: 404 });
    const item = await AccountAccess.findOneAndUpdate({ userId: member._id }, { $set: { active: parsed.data.active, grantedBy: auth.user!.id, grantedAt: new Date() } }, { upsert: true, new: true, runValidators: true });
    return Response.json({ ok: true, active: item.active });
  } catch { return Response.json({ error: "অ্যাক্সেস পরিবর্তন করা যায়নি" }, { status: 503 }); }
}
