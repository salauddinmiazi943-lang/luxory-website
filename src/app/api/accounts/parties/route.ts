import mongoose from "mongoose";
import { requireAccountsAdmin, isResponse } from "@/lib/accounts/admin";
import { getPartyLedger } from "@/lib/accounts/ledger";
import { connectDb } from "@/lib/db";
import { AccountParty } from "@/models/account-party";

const partyTypes = ["customer", "supplier", "staff", "other"] as const;

export async function GET(request: Request) {
  const access = await requireAccountsAdmin();
  if (isResponse(access)) return access.error;
  try {
    await connectDb();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      if (!mongoose.isValidObjectId(id)) return Response.json({ error: "পার্টি নির্বাচন সঠিক নয়।" }, { status: 400 });
      const party = await AccountParty.findById(id).lean();
      if (!party) return Response.json({ error: "পার্টি পাওয়া যায়নি।" }, { status: 404 });
      if (party.type !== "customer" && party.type !== "supplier") return Response.json({ error: "এই পাতায় Customer ও Supplier ledger দেখানো হয়।" }, { status: 400 });
      const from = params.get("from") ?? undefined, to = params.get("to") ?? undefined;
      return Response.json({ party, ...(await getPartyLedger(party._id, party.type, from, to)) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const parties = await AccountParty.find({}).sort({ type: 1, name: 1 }).lean();
    return Response.json({ parties }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "পার্টির তথ্য পাওয়া যায়নি।" }, { status: 400 });
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
    if (!name || name.length > 160 || typeof type !== "string" || !partyTypes.includes(type as typeof partyTypes[number])) {
      return Response.json({ error: "পার্টির নাম ও ধরন সঠিকভাবে দিন।" }, { status: 400 });
    }
    const party = await AccountParty.create({
      name, type: type as typeof partyTypes[number], phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 30) : undefined,
      address: typeof body.address === "string" ? body.address.trim().slice(0, 500) : undefined,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 2000) : undefined,
      createdBy: new mongoose.Types.ObjectId(access.user.id),
    });
    return Response.json({ party }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "পার্টি সংরক্ষণ হয়নি।" }, { status: 400 });
  }
}
