import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order, Product } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({ status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]) });
const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
const canTransition = (current: string, next: string) => current === next || transitions[current]?.includes(next);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requireUser(["super_admin", "admin", "vendor"]);
  if ("error" in access) return access.error;
  const admin = access.user.role !== "vendor" && hasPermission(access.user, "manage_bookings");
  if (!admin && access.user.role !== "vendor") return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid order id" }, { status: 400 });
    await connectDb();
    const order = await Order.findById(id);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const restock: { productId: string; variantId?: string; quantity: number }[] = [];
    if (admin) {
      if (order.items.some((item) => !canTransition(item.status, parsed.data.status))) {
        return Response.json({ error: "Order status cannot move backward or change after completion" }, { status: 409 });
      }
      if (parsed.data.status === "cancelled") {
        order.items.filter((item) => item.status !== "cancelled").forEach((item) => restock.push({ productId: String(item.productId), ...(item.variantId ? { variantId: String(item.variantId) } : {}), quantity: item.quantity }));
      }
      order.status = parsed.data.status;
      order.items.forEach((item) => { item.status = parsed.data.status; });
    } else {
      let updated = false;
      for (const item of order.items) {
        if (String(item.vendorId) === access.user.id) {
          if (!canTransition(item.status, parsed.data.status)) continue;
          if (parsed.data.status === "cancelled" && item.status !== "cancelled") restock.push({ productId: String(item.productId), ...(item.variantId ? { variantId: String(item.variantId) } : {}), quantity: item.quantity });
          item.status = parsed.data.status;
          updated = true;
        }
      }
      if (!updated) return Response.json({ error: "No eligible items found for this status change" }, { status: 409 });
      const statuses = order.items.map((item) => item.status);
      order.status = statuses.every((status) => status === statuses[0]) ? statuses[0] : "confirmed";
    }
    await order.save();
    await Promise.all(restock.map((item) => Product.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity, ...(item.variantId ? { "variants.$[variant].stock": item.quantity } : {}) } },
      item.variantId ? { arrayFilters: [{ "variant._id": item.variantId }] } : undefined,
    )));
    return Response.json({ item: order });
  } catch (error) {
    return apiError(error);
  }
}
