import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { StockMovement } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

const reasons = ["product_created", "product_updated", "order_placed", "order_cancelled", "order_rollback", "return_restocked"] as const;

export async function GET(request: Request) {
  try {
    const access = await requireUser(["super_admin", "admin"]);
    if ("error" in access) return access.error;
    if (!hasPermission(access.user, "manage_products")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId") ?? "";
    const reason = url.searchParams.get("reason") ?? "";
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

    const filter: Record<string, unknown> = {};
    if (mongoose.isValidObjectId(productId)) filter.productId = new mongoose.Types.ObjectId(productId);
    if ((reasons as readonly string[]).includes(reason)) filter.reason = reason;

    await connectDb();
    const items = await StockMovement.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("productId", "title slug unit")
      .populate("actorId", "name email role")
      .lean();

    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}