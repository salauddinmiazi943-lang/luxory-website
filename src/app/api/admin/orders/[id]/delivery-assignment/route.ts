import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order, User } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";

const schema = z.object({ deliveryStaffId: z.string().regex(/^[a-f\d]{24}$/i) });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_bookings");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid order ID" }, { status: 400 });
    await connectDb();
    const staff = await User.findOne({ _id: parsed.data.deliveryStaffId, role: "delivery_staff", status: "active" }).select("_id");
    if (!staff) return Response.json({ error: "Delivery staff account is not active or does not exist" }, { status: 400 });

    const order = await Order.findById(id);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const assignableStatuses = ["shipped", "failed"];
    if (!assignableStatuses.includes(order.status) || !order.items.length || order.items.some((item) => !assignableStatuses.includes(item.status))) {
      return Response.json({ error: "Only shipped orders or failed orders eligible for retry can be assigned" }, { status: 409 });
    }
    if (order.delivery.handovers.length) {
      return Response.json({ error: "This order uses the existing item handover workflow and cannot also receive an order-level assignment" }, { status: 409 });
    }
    const previous = order.delivery.assignment;
    if (previous?.assignedTo === parsed.data.deliveryStaffId) {
      return Response.json({ error: "This order is already assigned to that delivery staff member" }, { status: 409 });
    }

    const assignedAt = new Date();
    order.delivery.assignment = {
      assignedTo: parsed.data.deliveryStaffId,
      assignedBy: access.user.id,
      assignedAt,
    };
    order.delivery.assignmentHistory.push({
      assignedTo: parsed.data.deliveryStaffId,
      assignedBy: access.user.id,
      assignedAt,
      action: previous ? "reassigned" : "assigned",
      ...(previous ? { previousStaffId: previous.assignedTo } : {}),
    });
    order.deliveryAudit.push(createDeliveryAuditEntry(
      id,
      order.deliveryAudit.at(-1)?.hash ?? "",
      access.user,
      previous ? "delivery_order_reassigned" : "delivery_order_assigned",
      `${previous ? `${previous.assignedTo} -> ` : ""}${parsed.data.deliveryStaffId}`,
    ));
    await order.save();
    return Response.json({ item: { _id: String(order._id), assignment: order.delivery.assignment } });
  } catch (error) {
    if (error instanceof Error && error.name === "VersionError") {
      return Response.json({ error: "This order assignment changed at the same time. Refresh and try again." }, { status: 409 });
    }
    return apiError(error);
  }
}
