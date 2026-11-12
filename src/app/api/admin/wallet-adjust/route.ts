import { z } from "zod";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { CoinTransaction, User, UserWallet } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  user: z.string().trim().min(1).max(254),
  action: z.enum(["add", "deduct"]),
  coins: z.number().int().positive().max(10000000),
  description: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
  
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { user: identifier, action, coins, description } = parsed.data;
    await connectDb();

    const isId = mongoose.Types.ObjectId.isValid(identifier);
    const target = await User.findOne(isId ? { _id: identifier } : { email: identifier.toLowerCase() }).select("_id name email role").lean();
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const userId = target._id;
    await UserWallet.updateOne({ userId }, { $setOnInsert: { userId, balanceCoins: 0, totalEarnedCoins: 0, totalRedeemedCoins: 0 } }, { upsert: true });

    if (action === "deduct") {
      const res = await UserWallet.updateOne({ userId, balanceCoins: { $gte: coins } }, { $inc: { balanceCoins: -coins } });
      if (!res.modifiedCount) return NextResponse.json({ error: "Insufficient coin balance for deduction." }, { status: 400 });
      await CoinTransaction.create({ userId, amount: -coins, type: "admin_adjust", description });
    } else {
      await UserWallet.updateOne({ userId }, { $inc: { balanceCoins: coins } });
      await CoinTransaction.create({ userId, amount: coins, type: "admin_adjust", description });
    }

    const wallet = await UserWallet.findOne({ userId }).lean();
    return NextResponse.json({
      ok: true,
      user: { id: String(target._id), name: (target as any).name, email: (target as any).email, role: (target as any).role },
      wallet: { balanceCoins: wallet?.balanceCoins ?? 0, totalEarnedCoins: wallet?.totalEarnedCoins ?? 0, totalRedeemedCoins: wallet?.totalRedeemedCoins ?? 0 },
    });
  } catch (error) {
    return apiError(error);
  }
}
