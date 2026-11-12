import { connectDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { CoinTransaction, RewardVoucher, User, UserWallet } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
  
    await connectDb();
    const [walletAgg, voucherAgg, activeResellers, activeWholesalers, recentTx, recentVouchers] = await Promise.all([
      UserWallet.aggregate([
        { $group: { _id: null, totalEarned: { $sum: "$totalEarnedCoins" }, totalRedeemed: { $sum: "$totalRedeemedCoins" }, totalBalance: { $sum: "$balanceCoins" } } },
      ]),
      RewardVoucher.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
      ]),
      User.countDocuments({ role: "reseller", status: "active" }),
      User.countDocuments({ role: "wholesaler", status: "active" }),
      CoinTransaction.find().sort({ createdAt: -1 }).limit(20).populate("userId", "name email role").lean(),
      RewardVoucher.find().sort({ createdAt: -1 }).limit(20).populate("userId", "name email role").lean(),
    ]);

    const w = walletAgg[0] ?? { totalEarned: 0, totalRedeemed: 0, totalBalance: 0 };
    const voucherStats = { active: { count: 0, amount: 0 }, used: { count: 0, amount: 0 }, expired: { count: 0, amount: 0 } };
    for (const row of voucherAgg as { _id: string; count: number; amount: number }[]) {
      if (row._id === "active" || row._id === "used" || row._id === "expired") voucherStats[row._id] = { count: row.count, amount: row.amount };
    }

    return NextResponse.json({
      coins: { totalEarned: w.totalEarned || 0, totalRedeemed: w.totalRedeemed || 0, totalBalance: w.totalBalance || 0 },
      vouchers: voucherStats,
      roles: { activeResellers, activeWholesalers },
      recentTransactions: (recentTx as any[]).map((tx) => ({
        _id: String(tx._id), amount: tx.amount, type: tx.type, description: tx.description,
        createdAt: tx.createdAt, orderId: tx.orderId ? String(tx.orderId) : null,
        user: tx.userId ? { name: (tx.userId as any).name, email: (tx.userId as any).email, role: (tx.userId as any).role } : null,
      })),
      recentVouchers: (recentVouchers as any[]).map((v) => ({
        _id: String(v._id), voucherCode: v.voucherCode, amount: v.amount, minOrderAmount: v.minOrderAmount,
        status: v.status, expiresAt: v.expiresAt, createdAt: v.createdAt, usedAt: v.usedAt,
        user: v.userId ? { name: (v.userId as any).name, email: (v.userId as any).email, role: (v.userId as any).role } : null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
