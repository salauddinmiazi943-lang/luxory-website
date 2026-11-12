import { apiError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CoinTransaction, UserWallet } from "@/lib/models";
import { getCoinSettings, redeemValueBdt } from "@/lib/coin-rewards";

export async function GET() {
  try {
    await connectDb();
    const settings = await getCoinSettings();
    const session = await getSession();
    let wallet: { balanceCoins: number } | null = null;
    if (session && (session.role === "customer" || session.role === "reseller" || session.role === "wholesaler")) {
      await UserWallet.updateOne({ userId: session.id }, { $setOnInsert: { userId: session.id, balanceCoins: 0, totalEarnedCoins: 0, totalRedeemedCoins: 0 } }, { upsert: true });
      const w = await UserWallet.findOne({ userId: session.id }).lean();
      wallet = { balanceCoins: Number(w?.balanceCoins || 0) };
    }
    return Response.json({
      settings: {
        coinRedemption: settings.coinRedemption,
        toggles: { rewardSystemEnabled: settings.toggles.rewardSystemEnabled, coinUsageEnabled: settings.toggles.coinUsageEnabled, voucherSystemEnabled: settings.toggles.voucherSystemEnabled },
      },
      wallet,
      canRedeem: Boolean(wallet && settings.toggles.rewardSystemEnabled && settings.toggles.coinUsageEnabled),
    });
  } catch (error) {
    return apiError(error);
  }
}
