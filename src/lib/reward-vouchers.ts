import crypto from "crypto";
import mongoose from "mongoose";
import { Order, RewardVoucher } from "@/lib/models";
import { getCoinSettings } from "@/lib/coin-rewards";

function code() {
  return `LGT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function issueRewardVouchersIfEligible(userId: string) {
  const settings = await getCoinSettings();
  if (!settings.toggles.rewardSystemEnabled || !settings.toggles.voucherSystemEnabled) {
    return { issued: 0, reason: "disabled" as const };
  }
  const threshold = Number(settings.voucher.purchaseThreshold || 0);
  const amount = Number(settings.voucher.voucherAmount || 0);
  const expiryDays = Math.max(0, Math.floor(Number(settings.voucher.expiryDays || 0)));
  const minOrderAmount = Math.max(0, Number(settings.voucher.minOrderAmount || 0));
  if (threshold <= 0 || amount <= 0) return { issued: 0, reason: "not_configured" as const };

  const uid = new mongoose.Types.ObjectId(userId);
  const agg = await Order.aggregate([
    { $match: { customer: uid, status: "delivered" } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$subtotal", "$total"] } } } },
  ]);
  const totalSpent = Number(agg[0]?.total || 0);
  const earnedCount = Math.floor(totalSpent / threshold);
  if (earnedCount <= 0) return { issued: 0, reason: "below_threshold" as const, totalSpent };

  let issued = 0;
  for (let i = 1; i <= earnedCount; i++) {
    const milestone = i * threshold;
    const exists = await RewardVoucher.findOne({ userId: uid, milestone }).lean();
    if (exists) continue;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await RewardVoucher.create({ userId: uid, voucherCode: code(), amount, minOrderAmount, expiresAt, status: "active", milestone });
        issued += 1;
        break;
      } catch (e: unknown) {
        const msg = e && typeof e === "object" && "code" in e ? (e as { code?: number }).code : 0;
        if (msg === 11000) continue;
        throw e;
      }
    }
  }
  return { issued, totalSpent, earnedCount };
}

export async function validateVoucherForCheckout(userId: string, voucherCodeRaw: string, payableBeforeVoucher: number) {
  const settings = await getCoinSettings();
  if (!settings.toggles.rewardSystemEnabled || !settings.toggles.voucherSystemEnabled) {
    return { ok: false as const, error: "Voucher system is currently disabled." };
  }
  const voucherCode = String(voucherCodeRaw || "").trim().toUpperCase();
  if (!voucherCode) return { ok: true as const, voucher: null, discountBdt: 0, voucherCode: "" };
  const now = new Date();
  const voucher = await RewardVoucher.findOne({ userId, voucherCode });
  if (!voucher) return { ok: false as const, error: "Voucher not found." };
  if (String(voucher.userId) !== String(userId)) return { ok: false as const, error: "Voucher not found." };
  if (voucher.status === "used") return { ok: false as const, error: "Voucher has already been used." };
  if (voucher.status === "expired" || voucher.expiresAt <= now) {
    if (voucher.status !== "expired") { voucher.status = "expired"; await voucher.save().catch(() => {}); }
    return { ok: false as const, error: "Voucher has expired." };
  }
  if (voucher.status !== "active") return { ok: false as const, error: "Voucher is not active." };
  if (payableBeforeVoucher < Number(voucher.minOrderAmount || 0)) {
    return { ok: false as const, error: `Minimum order amount for this voucher is ৳${Number(voucher.minOrderAmount || 0).toLocaleString("en-BD")}.` };
  }
  const discountBdt = Math.min(Number(voucher.amount || 0), Math.max(0, payableBeforeVoucher));
  return { ok: true as const, voucher, discountBdt, voucherCode };
}

export async function markVoucherUsed(voucherId: string, userId: string, orderId: string) {
  const res = await RewardVoucher.updateOne(
    { _id: voucherId, userId, status: "active", expiresAt: { $gt: new Date() } },
    { $set: { status: "used", usedAt: new Date(), orderId } },
  );
  return res.modifiedCount > 0;
}

export async function listUserVouchers(userId: string) {
  const now = new Date();
  await RewardVoucher.updateMany({ userId, status: "active", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const vouchers = await RewardVoucher.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  return vouchers.map((v) => ({
    _id: String(v._id),
    voucherCode: v.voucherCode,
    amount: v.amount,
    minOrderAmount: v.minOrderAmount,
    expiresAt: v.expiresAt,
    status: v.status,
    createdAt: v.createdAt,
    usedAt: v.usedAt,
    orderId: v.orderId ? String(v.orderId) : null,
  }));
}
