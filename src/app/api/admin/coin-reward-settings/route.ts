import { z } from "zod";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { CoinRewardSettings } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { readJson } from "@/lib/http";

const schema = z.object({
  coinEarning: z.object({
    retailPer1000: z.number().min(0).max(100000),
    resellerPer1000: z.number().min(0).max(100000),
    wholesalerPer1000: z.number().min(0).max(100000),
  }),
  coinRedemption: z.object({
    coins: z.number().int().min(1).max(1000000),
    bdt: z.number().min(0).max(1000000),
    minRedeemCoins: z.number().int().min(0).max(10000000),
  }),
  voucher: z.object({
    purchaseThreshold: z.number().min(0).max(100000000),
    voucherAmount: z.number().min(0).max(10000000),
    expiryDays: z.number().int().min(0).max(3650),
    minOrderAmount: z.number().min(0).max(100000000),
  }),
  toggles: z.object({
    rewardSystemEnabled: z.boolean(),
    coinUsageEnabled: z.boolean(),
    voucherSystemEnabled: z.boolean(),
  }),
});

const defaults = {
  coinEarning: { retailPer1000: 3, resellerPer1000: 3, wholesalerPer1000: 3 },
  coinRedemption: { coins: 100, bdt: 5, minRedeemCoins: 500 },
  voucher: { purchaseThreshold: 50000, voucherAmount: 500, expiryDays: 30, minOrderAmount: 0 },
  toggles: { rewardSystemEnabled: false, coinUsageEnabled: false, voucherSystemEnabled: false },
};

function normalize(settings: Partial<typeof defaults> & { updatedAt?: Date } | null) {
  return {
    coinEarning: { ...defaults.coinEarning, ...(settings?.coinEarning ?? {}) },
    coinRedemption: { ...defaults.coinRedemption, ...(settings?.coinRedemption ?? {}) },
    voucher: { ...defaults.voucher, ...(settings?.voucher ?? {}) },
    toggles: { ...defaults.toggles, ...(settings?.toggles ?? {}) },
    updatedAt: settings?.updatedAt ?? null,
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
    await connectDb();
    const settings = await CoinRewardSettings.findOne().lean();
    return NextResponse.json(normalize(settings as Parameters<typeof normalize>[0]));
  } catch (error) {
    console.error("coin-reward-settings GET failed", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("MONGODB_URI") || message.includes("MONGO_USER")) return jsonError("Database is not configured", 503);
    if (message.includes("JWT_SECRET")) return jsonError("Authentication is not configured", 503);
    if (message.includes("ECONNREFUSED") || message.includes("querySrv")) return jsonError("Database is temporarily unavailable", 503);
    return jsonError("Could not load coin & reward settings", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const settings = await CoinRewardSettings.findOneAndUpdate(
      {},
      { $set: { ...parsed.data, updatedBy: access.user.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json(normalize(settings as Parameters<typeof normalize>[0]));
  } catch (error) {
    console.error("coin-reward-settings PATCH failed", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("MONGODB_URI") || message.includes("MONGO_USER")) return jsonError("Database is not configured", 503);
    if (message.includes("JWT_SECRET")) return jsonError("Authentication is not configured", 503);
    if (message.includes("ECONNREFUSED") || message.includes("querySrv")) return jsonError("Database is temporarily unavailable", 503);
    return jsonError("Could not save coin & reward settings", 500);
  }
}
