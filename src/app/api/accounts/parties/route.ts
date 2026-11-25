import { z } from "zod";
import { connectDb } from "@/lib/db";
import { accountsApiUser } from "@/lib/accounts/access";
import { AccountParty, AccountTransaction } from "@/models/accounts";

const partySchema = z.object({ name: z.string().trim().min(2).max(120), type: z.enum(["customer", "supplier"]), phone: z.string().trim().max(40).default(""), address: z.string().trim().max(500).default(""), openingBalance: z.number().finite().min(0).max(1_000_000_000).default(0) });

export async function GET(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  try {
    await connectDb();
    const items = await AccountParty.find(url.searchParams.get("all") === "true" ? {} : { active: true }).sort({ type: 1, name: 1 }).limit(1000).lean();
    const balances = await AccountTransaction.aggregate([
      { $match: { deletedAt: null, partyId: { $ne: null } } },
      { $group: { _id: { partyId: "$partyId", type: "$type" }, total: { $sum: "$amountPaisa" }, paid: { $sum: "$paidPaisa" } } },
    ]);
    const byParty = new Map<string, number>();
    for (const row of balances) {
      const id = String(row._id.partyId);
      const amount = row._id.type === "sale" ? row.total - row.paid : row._id.type === "collection" ? -row.total : row._id.type === "purchase" ? row.total - row.paid : row._id.type === "supplier_payment" ? -row.total : 0;
      byParty.set(id, (byParty.get(id) ?? 0) + amount);
    }
    return Response.json({ items: items.map((item) => ({ ...item, balancePaisa: (item.openingBalancePaisa ?? 0) + (byParty.get(String(item._id)) ?? 0) })) });
  } catch {
    return Response.json({ error: "পার্টির তালিকা আনা যায়নি" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  try {
    const parsed = partySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য যাচাই করুন" }, { status: 400 });
    await connectDb();
    const { openingBalance, ...fields } = parsed.data;
    const item = await AccountParty.create({ ...fields, openingBalancePaisa: Math.round(openingBalance * 100), createdBy: auth.user!.id });
    return Response.json({ item }, { status: 201 });
  } catch {
    return Response.json({ error: "পার্টি সংরক্ষণ করা যায়নি" }, { status: 503 });
  }
}
