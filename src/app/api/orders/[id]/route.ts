import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order, Product } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";
import { aggregateOrderStatus } from "@/lib/order-status";
import { verifyDeliveryAccessKey } from "@/lib/delivery-security";
import { awardOrderCoinsIfEligible } from "@/lib/coin-rewards";
import { recordStockMovements } from "@/lib/stock-movements";
import { orderIdFilter } from "@/lib/order-id";

const schema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
  notes: z.string().trim().max(1000).optional(),
  notifyCustomer: z.boolean().optional(),
});
const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["cancelled"],
  delivered: [],
  cancelled: [],
};
const canTransition = (current: string, next: string) => transitions[current]?.includes(next) ?? false;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const orderFilter = orderIdFilter(id);
  if (!orderFilter) return Response.json({ error: "Invalid order id" }, { status: 400 });
  try {
    await connectDb();
    const accessKey = new URL(request.url).searchParams.get("accessKey") ?? "";
    const order = await Order.findOne(orderFilter).select(accessKey ? "+delivery.accessKeyHash" : "").lean();
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const access = await requireUser(["super_admin","admin","vendor","customer"]).catch(() => null);
    const user = access && !("error" in access) ? access.user : null;
    const admin = user && (user.role === "super_admin" || (user.role === "admin" && hasPermission(user, "manage_bookings")));
    const customerOwner = user?.role === "customer" && (String(order.customer ?? "") === user.id || Boolean(order.customerInfo?.email && order.customerInfo.email.toLowerCase() === user.email.toLowerCase()));
    const vendorOwner = user?.role === "vendor" && order.items.some((item) => String(item.vendorId ?? "") === user.id);
    const guestOwner = !order.customer && accessKey && verifyDeliveryAccessKey(accessKey, order.delivery?.accessKeyHash);
    if (!admin && !customerOwner && !vendorOwner && !guestOwner) return Response.json({ error: "Order not found" }, { status: 404 });
    const safe = {
      _id: String(order._id), status: order.status, subtotal: order.subtotal, deliveryCharge: order.deliveryCharge, total: order.total, paymentMethod: order.paymentMethod, createdAt: (order as { createdAt?: Date }).createdAt,
      items: order.items.map((item) => ({ title: item.title, variantLabel: item.variantLabel, unit: item.unit, quantity: item.quantity, originalPrice: item.originalPrice, unitPrice: item.unitPrice, discountPercent: item.discountPercent, lineTotal: item.lineTotal, status: item.status })),
      customerInfo: order.customerInfo ? { name: order.customerInfo.name, phone: order.customerInfo.phone, division: order.customerInfo.division, district: order.customerInfo.district, upazila: order.customerInfo.upazila, union: order.customerInfo.union, area: order.customerInfo.area, address: order.customerInfo.address } : undefined,
    };
    return Response.json({ item: safe });
  } catch (error) {
    console.error("GET /api/orders/[id] error:", error);
    return apiError(error);
  }
}


export async function PATCH(request: Request, { params }: Context) {
  const access = await requireUser(["super_admin", "admin", "vendor"]);
  if ("error" in access) return access.error;
  const admin = access.user.role !== "vendor" && hasPermission(access.user, "manage_bookings");
  if (!admin && access.user.role !== "vendor") return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    if (parsed.data.status === "delivered") {
      return Response.json({ error: "Use the delivery action to record a delivered order." }, { status: 409 });
    }
    const { id } = await params;
    const orderFilter = orderIdFilter(id);
    if (!orderFilter) return Response.json({ error: "Invalid order id" }, { status: 400 });
    await connectDb();
    const order = await Order.findOne(orderFilter);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const previousStatus = order.status;
    const restock: { productId: string; variantId?: string; quantity: number; title: string; variantLabel: string }[] = [];
    if (admin) {
      if (order.items.some((item) => !canTransition(item.status, parsed.data.status))) {
        return Response.json({ error: "Order status cannot move backward or change after completion" }, { status: 409 });
      }
      if (parsed.data.status === "cancelled") {
        order.items.filter((item) => item.status !== "cancelled").forEach((item) => restock.push({ productId: String(item.productId), ...(item.variantId ? { variantId: String(item.variantId) } : {}), quantity: item.quantity, title: item.title, variantLabel: item.variantLabel ?? "" }));
      }
      order.status = parsed.data.status;
      order.items.forEach((item) => { item.status = parsed.data.status; });
    } else {
      let updated = false;
      for (const item of order.items) {
        if (String(item.vendorId) === access.user.id) {
          if (!canTransition(item.status, parsed.data.status)) continue;
          if (parsed.data.status === "cancelled" && item.status !== "cancelled") restock.push({ productId: String(item.productId), ...(item.variantId ? { variantId: String(item.variantId) } : {}), quantity: item.quantity, title: item.title, variantLabel: item.variantLabel ?? "" });
          item.status = parsed.data.status;
          updated = true;
        }
      }
      if (!updated) return Response.json({ error: "No eligible items found for this status change" }, { status: 409 });
      const statuses = order.items.map((item) => item.status);
      order.status = aggregateOrderStatus(statuses);
    }
    order.deliveryAudit.push(createDeliveryAuditEntry(
      id,
      order.deliveryAudit.at(-1)?.hash ?? "",
      { id: access.user.id, role: access.user.role },
      "status_changed",
      `${previousStatus} -> ${order.status}; actor ${access.user.id}`,
    ));
    await order.save();
    if (order.status === "delivered") {
      try { await awardOrderCoinsIfEligible(id); } catch { /* non-fatal */ }
    }
    await Promise.all(restock.map((item) => Product.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity, ...(item.variantId ? { "variants.$[variant].stock": item.quantity } : {}) } },
      item.variantId ? { arrayFilters: [{ "variant._id": item.variantId }] } : undefined,
    )));
    await recordStockMovements(restock.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productTitle: item.title,
      variantLabel: item.variantLabel,
      delta: item.quantity,
      reason: "order_cancelled" as const,
      orderId: order._id,
      actorId: access.user.id,
      actorRole: access.user.role,
      note: "অর্ডার বাতিল · স্টক ফেরত",
    })));
    return Response.json({ item: order });
  } catch (error) {
    console.error("PATCH /api/orders/[id] error:", error);
    if (error instanceof Error && error.name === "VersionError") {
      return Response.json({ error: "This order changed at the same time. Refresh and try again." }, { status: 409 });
    }
    return apiError(error);
  }
}
