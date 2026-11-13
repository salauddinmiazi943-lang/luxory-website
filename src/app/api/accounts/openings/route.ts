import { z } from "zod";
import { connectDb } from "@/lib/db";
import { accountsApiUser, bangladeshToday, isValidDateOnly } from "@/lib/accounts/access";
import { AccountOpening, AccountTransaction, accountMethods } from "@/models/accounts";
import { startOfDay } from "@/lib/accounts/access";

export async function GET(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const date = new URL(request.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isValidDateOnly(date)) return Response.json({ error: "তারিখটি সঠিক নয়" }, { status: 400 });
  try {
    await connectDb();
    const [todayOpening, priorOpenings] = await Promise.all([
      AccountOpening.find({ date }).lean(),
      AccountOpening.aggregate([{ $match: { date: { $lt: date } } }, { $sort: { date: -1 } }, { $group: { _id: "$method", date: { $first: "$date" }, amountPaisa: { $first: "$amountPaisa" } } }]),
    ]);
    const currentByMethod = new Map(todayOpening.map((item) => [item.method, item.amountPaisa]));
    const previousByMethod = new Map(priorOpenings.map((item) => [item._id as string, item]));
    const items = await Promise.all(accountMethods.map(async (method) => {
      if (currentByMethod.has(method)) return { method, amountPaisa: currentByMethod.get(method)! };
      const previous = previousByMethod.get(method);
      if (!previous) return { method, amountPaisa: 0 };
      const movement = await AccountTransaction.aggregate([
        { $match: { method, date: { $gte: startOfDay(previous.date), $lt: startOfDay(date) }, deletedAt: null } },
        { $group: { _id: null, total: { $sum: { $switch: { branches: [
          { case: { $eq: ["$type", "sale"] }, then: "$paidPaisa" },
          { case: { $in: ["$type", ["collection", "other_income"]] }, then: "$amountPaisa" },
          { case: { $eq: ["$type", "purchase"] }, then: { $multiply: ["$paidPaisa", -1] } },
          { case: { $in: ["$type", ["supplier_payment", "expense"]] }, then: { $multiply: ["$amountPaisa", -1] } },
        ], default: 0 } } } } },
      ]);
      return { method, amountPaisa: previous.amountPaisa + (movement[0]?.total ?? 0) };
    }));
    return Response.json({ date, items });
  } catch { return Response.json({ error: "শুরুর ব্যালেন্স আনা যায়নি" }, { status: 503 }); }
}

const schema = z.object({ date: z.string().refine(isValidDateOnly), method: z.enum(accountMethods), amount: z.number().finite().min(0).max(1_000_000_000) });
export async function PUT(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  if (!auth.user!.accountsAdmin) return Response.json({ error: "শুধু অ্যাডমিন শুরুর ব্যালেন্স বদলাতে পারবেন" }, { status: 403 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য যাচাই করুন" }, { status: 400 });
    if (parsed.data.date > bangladeshToday()) return Response.json({ error: "ভবিষ্যতের তারিখে Opening Balance দেওয়া যাবে না" }, { status: 400 });
    await connectDb();
    const item = await AccountOpening.findOneAndUpdate({ date: parsed.data.date, method: parsed.data.method }, { $set: { amountPaisa: Math.round(parsed.data.amount * 100), updatedBy: auth.user!.id } }, { upsert: true, new: true, runValidators: true });
    return Response.json({ item });
  } catch { return Response.json({ error: "শুরুর ব্যালেন্স সংরক্ষণ করা যায়নি" }, { status: 503 }); }
}
