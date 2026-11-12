import { connectDb } from "@/lib/db";
import { CoinTransaction, UserWallet } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["customer", "reseller", "wholesaler"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    await UserWallet.updateOne({ userId: access.user.id }, { $setOnInsert: { userId: access.user.id, balanceCoins: 0, totalEarnedCoins: 0, totalRedeemedCoins: 0 } }, { upsert: true });
    const wallet = await UserWallet.findOne({ userId: access.user.id }).lean();
    const transactions = await CoinTransaction.find({ userId: access.user.id }).sort({ createdAt: -1 }).limit(50).lean();
    return Response.json({
      wallet: wallet ? { balanceCoins: wallet.balanceCoins, totalEarnedCoins: wallet.totalEarnedCoins, totalRedeemedCoins: wallet.totalRedeemedCoins } : { balanceCoins: 0, totalEarnedCoins: 0, totalRedeemedCoins: 0 },
      transactions: transactions.map((tx) => ({ _id: String(tx._id), amount: tx.amount, type: tx.type, description: tx.description, orderId: tx.orderId ? String(tx.orderId) : null, createdAt: tx.createdAt })),
    });
  } catch (error) {
    return apiError(error);
  }
}
