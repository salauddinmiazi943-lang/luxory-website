import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { accountsApiUser } from "@/lib/accounts/access";
import { AccountParty, AccountTransaction } from "@/models/accounts";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await accountsApiUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return Response.json({ error: "পার্টি পাওয়া যায়নি" }, { status: 404 });
  try {
    await connectDb();
    const [party, items] = await Promise.all([
      AccountParty.findById(id).lean(),
      AccountTransaction.find({ partyId: id, deletedAt: null }).sort({ date: 1, createdAt: 1 }).lean(),
    ]);
    if (!party) return Response.json({ error: "পার্টি পাওয়া যায়নি" }, { status: 404 });
    let balance = party.openingBalancePaisa ?? 0;
    const ledger = items.map((item) => {
      const delta = party.type === "customer" ? item.type === "sale" ? item.amountPaisa - item.paidPaisa : item.type === "collection" ? -item.amountPaisa : 0 : item.type === "purchase" ? item.amountPaisa - item.paidPaisa : item.type === "supplier_payment" ? -item.amountPaisa : 0;
      balance += delta;
      return { ...item, deltaPaisa: delta, balancePaisa: balance };
    });
    return Response.json({ party, items: ledger, balancePaisa: balance });
  } catch { return Response.json({ error: "পার্টির খাতা আনা যায়নি" }, { status: 503 }); }
}
