import { connectDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { CoinTransaction, RewardVoucher, User, UserWallet } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

type PopulatedUser = { name?: string; email?: string; role?: string };
type TxRow = {
  _id: unknown; amount: number; type: string; description?: string; createdAt?: Date | string;
  orderId?: unknown; userId?: PopulatedUser | null;
};
type VoucherRow = {
  _id: unknown; voucherCode: string; amount?: number; minOrderAmount?: number; status: string;
  expiresAt?: Date | string; createdAt?: Date | string; usedAt?: Date | string; userId?: PopulatedUser | null;
};

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
      recentTransactions: (recentTx as unknown as TxRow[]).map((tx) => ({
        _id: String(tx._id), amount: tx.amount, type: tx.type, description: tx.description,
        createdAt: tx.createdAt, orderId: tx.orderId ? String(tx.orderId) : null,
        user: tx.userId ? { name: tx.userId.name, email: tx.userId.email, role: tx.userId.role } : null,
      })),
      recentVouchers: (recentVouchers as unknown as VoucherRow[]).map((v) => ({
        _id: String(v._id), voucherCode: v.voucherCode, amount: v.amount, minOrderAmount: v.minOrderAmount,
        status: v.status, expiresAt: v.expiresAt, createdAt: v.createdAt, usedAt: v.usedAt,
        user: v.userId ? { name: v.userId.name, email: v.userId.email, role: v.userId.role } : null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
