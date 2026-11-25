import mongoose from "mongoose";
import { CoinRewardSettings, CoinTransaction, Order, User, UserWallet } from "@/lib/models";

export type CoinSettings = {
  coinEarning: { retailPer1000: number; resellerPer1000: number; wholesalerPer1000: number };
  coinRedemption: { coins: number; bdt: number; minRedeemCoins: number };
  voucher: { purchaseThreshold: number; voucherAmount: number; expiryDays: number; minOrderAmount: number };
  toggles: { rewardSystemEnabled: boolean; coinUsageEnabled: boolean; voucherSystemEnabled: boolean };
};

export const defaultCoinSettings: CoinSettings = {
  coinEarning: { retailPer1000: 3, resellerPer1000: 3, wholesalerPer1000: 3 },
  coinRedemption: { coins: 100, bdt: 5, minRedeemCoins: 500 },
  voucher: { purchaseThreshold: 50000, voucherAmount: 500, expiryDays: 30, minOrderAmount: 0 },
  toggles: { rewardSystemEnabled: false, coinUsageEnabled: false, voucherSystemEnabled: false },
};

export async function getCoinSettings(): Promise<CoinSettings> {
  const settings = await CoinRewardSettings.findOne().lean();
  if (!settings) return defaultCoinSettings;
  return {
    coinEarning: { ...defaultCoinSettings.coinEarning, ...(settings.coinEarning ?? {}) },
    coinRedemption: { ...defaultCoinSettings.coinRedemption, ...(settings.coinRedemption ?? {}) },
    voucher: { ...defaultCoinSettings.voucher, ...(settings.voucher ?? {}) },
    toggles: { ...defaultCoinSettings.toggles, ...(settings.toggles ?? {}) },
  };
}

export function buyerEarnRole(role?: string | null): "retail" | "reseller" | "wholesaler" {
  if (role === "reseller") return "reseller";
  if (role === "wholesaler") return "wholesaler";
  return "retail";
}

export function coinsPer1000ForRole(settings: CoinSettings, role?: string | null) {
  const r = buyerEarnRole(role);
  if (r === "reseller") return Number(settings.coinEarning.resellerPer1000 || 0);
  if (r === "wholesaler") return Number(settings.coinEarning.wholesalerPer1000 || 0);
  return Number(settings.coinEarning.retailPer1000 || 0);
}

export function calculateEarnCoins(settings: CoinSettings, role: string | null | undefined, amountBdt: number) {
  const rate = coinsPer1000ForRole(settings, role);
  if (!Number.isFinite(amountBdt) || amountBdt <= 0 || rate <= 0) return 0;
  return Math.floor((amountBdt / 1000) * rate);
}

export function redeemValueBdt(settings: CoinSettings, coins: number) {
  const c = Math.max(0, Math.floor(Number(coins) || 0));
  const per = Number(settings.coinRedemption.coins || 0);
  const bdt = Number(settings.coinRedemption.bdt || 0);
  if (per <= 0 || bdt < 0 || c <= 0) return 0;
  return (c / per) * bdt;
}

export async function ensureWallet(userId: string) {
  const id = new mongoose.Types.ObjectId(userId);
  await UserWallet.updateOne({ userId: id }, { $setOnInsert: { userId: id, balanceCoins: 0, totalEarnedCoins: 0, totalRedeemedCoins: 0 } }, { upsert: true });
  return UserWallet.findOne({ userId: id });
}

export async function awardOrderCoinsIfEligible(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order) return { awarded: 0, reason: "not_found" };
  if (!order.customer) return { awarded: 0, reason: "guest" };
  // Earn on delivered orders only (COD completion). Idempotent via existing earn transaction.
  if (order.status !== "delivered") return { awarded: 0, reason: "not_delivered" };
  const settings = await getCoinSettings();
  if (!settings.toggles.rewardSystemEnabled || !settings.toggles.coinUsageEnabled) {
    // coin earning part of reward/coin system: require reward system enabled
    return { awarded: 0, reason: "disabled" };
  }
  const existing = await CoinTransaction.findOne({ orderId: order._id, userId: order.customer, type: "earn" }).lean();
  if (existing) return { awarded: 0, reason: "already_awarded" };
  const user = await User.findById(order.customer).select("role").lean();
  const role = user?.role ?? "customer";
  const baseAmount = Number(order.subtotal ?? order.total ?? 0);
  const coins = calculateEarnCoins(settings, role, baseAmount);
  if (coins <= 0) return { awarded: 0, reason: "zero" };
  await ensureWallet(String(order.customer));
  await CoinTransaction.create({ userId: order.customer, orderId: order._id, amount: coins, type: "earn", description: `Coins earned for delivered order ${String(order._id)} (৳${baseAmount.toLocaleString("en-BD")})` });
  await UserWallet.updateOne({ userId: order.customer }, { $inc: { balanceCoins: coins, totalEarnedCoins: coins } });
  return { awarded: coins, reason: "ok" };
}

export async function validateRedeemRequest(userId: string, requestedCoins: number, payableBeforeCoin: number) {
  const settings = await getCoinSettings();
  const coins = Math.floor(Number(requestedCoins) || 0);
  if (!settings.toggles.rewardSystemEnabled || !settings.toggles.coinUsageEnabled) {
    return { ok: false as const, error: "Coin usage is currently disabled." };
  }
  if (coins <= 0) return { ok: true as const, coins: 0, discountBdt: 0, settings };
  if (coins < Number(settings.coinRedemption.minRedeemCoins || 0)) {
    return { ok: false as const, error: `Minimum ${settings.coinRedemption.minRedeemCoins} coins required to redeem.` };
  }
  await ensureWallet(userId);
  const wallet = await UserWallet.findOne({ userId }).lean();
  const balance = Number(wallet?.balanceCoins || 0);
  if (coins > balance) return { ok: false as const, error: "Insufficient coin balance." };
  let discountBdt = redeemValueBdt(settings, coins);
  if (!Number.isFinite(discountBdt) || discountBdt < 0) discountBdt = 0;
  discountBdt = Math.min(discountBdt, Math.max(0, payableBeforeCoin));
  // prevent negative/over-discount; keep server-trusted
  return { ok: true as const, coins, discountBdt, settings, balance };
}
