import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";

const ONLINE_METHODS = ["BKASH", "NAGAD", "ROCKET", "BANK"] as const;

const patchSchema = z.object({
  orderId: z.string().regex(/^[a-f\d]{24}$/i),
  action: z.enum(["verify", "reject"]),
  reason: z.string().trim().max(300).optional().default(""),
});

function listFilter(status: string, method: string) {
  const filter: Record<string, unknown> = { paymentMethod: { $in: [...ONLINE_METHODS] } };
  if (ONLINE_METHODS.includes(method as (typeof ONLINE_METHODS)[number])) filter.paymentMethod = method;
  if (["pending", "verified", "rejected"].includes(status)) filter["payment.status"] = status;
  return filter;
}

export async function GET(request: Request) {
  const access = await requirePermission("view_bookings");
  if ("error" in access) return access.error;
  try {
    const url = new URL(request.url);
    await connectDb();
    const items = await Order.find(listFilter(url.searchParams.get("status") ?? "", url.searchParams.get("method") ?? ""))
      .sort({ createdAt: -1 })
      .limit(300)
      .select("customerInfo total paymentMethod payment status createdAt")
      .populate("customer", "name email phone")
      .lean();
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await requirePermission("manage_bookings");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, patchSchema);
    if ("error" in parsed) return parsed.error;
    const { orderId, action, reason } = parsed.data;
    await connectDb();

    const order = await Order.findOne({ _id: orderId, paymentMethod: { $in: [...ONLINE_METHODS] } });
    if (!order) return NextResponse.json({ error: "Manual payment order not found" }, { status: 404 });
    if (!order.payment) return NextResponse.json({ error: "This order has no payment record" }, { status: 409 });
    if (order.payment.status === "verified") return NextResponse.json({ error: "Payment is already verified" }, { status: 409 });
    if (action === "reject" && !reason.trim()) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

    order.payment.status = action === "verify" ? "verified" : "rejected";
    order.payment.rejectReason = action === "reject" ? reason.trim() : "";
    order.payment.verifiedBy = new mongoose.Types.ObjectId(access.user.id);
    order.payment.verifiedAt = new Date();
    order.deliveryAudit.push(createDeliveryAuditEntry(
      String(order._id),
      order.deliveryAudit.at(-1)?.hash ?? "",
      { id: access.user.id, role: access.user.role },
      action === "verify" ? "manual_payment_verified" : "manual_payment_rejected",
      `${order.paymentMethod} TrxID ${order.payment.transactionId}; actor ${access.user.id}`,
    ));
    if (action === "verify" && order.status === "pending") order.status = "confirmed";
    await order.save();

    return NextResponse.json({ item: { _id: String(order._id), payment: order.payment, status: order.status } });
  } catch (error) {
    return apiError(error);
  }
}