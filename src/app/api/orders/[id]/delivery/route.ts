import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order, Product, User } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";
import { aggregateOrderStatus } from "@/lib/order-status";
import { maybeRequestAutomaticDeliveryAudit } from "@/lib/delivery-audit-sampling";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delivered"), notes: z.string().trim().max(1000).default(""), notifyCustomer: z.boolean().default(false) }),
  z.object({ action: z.literal("failed"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("request_verification"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("verify"), status: z.enum(["verified", "flagged"]), notes: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("report"), reason: z.enum(["not_received", "late", "missing_items", "damaged", "other"]), details: z.string().trim().max(1000).default(""), requestId: z.string().uuid().optional() }),
  z.object({ action: z.literal("resolve_report"), reportId: objectId }),
  z.object({
    action: z.literal("record_return"),
    items: z.array(z.object({ productId: objectId, variantId: objectId.optional(), handoverId: objectId.optional(), countedQuantity: z.number().min(0).max(100_000) })).min(1).max(30),
    notes: z.string().trim().max(1000).default(""),
  }),
  z.object({ action: z.literal("confirm_return"), returnId: objectId, condition: z.enum(["good", "damaged", "disputed"]) }),
  z.object({ action: z.literal("assign_handover"), productId: objectId, variantId: objectId.optional(), assignedTo: objectId, assignedQuantity: z.number().positive().max(100_000) }),
  z.object({ action: z.literal("accept_handover"), handoverId: objectId, acceptedQuantity: z.number().min(0).max(100_000) }),
  z.object({ action: z.literal("verify_handover"), handoverId: objectId, verifiedQuantity: z.number().min(0).max(100_000) }),
  z.object({ action: z.literal("reconcile_handover"), handoverId: objectId, missingQuantity: z.number().min(0).max(100_000), disputedQuantity: z.number().min(0).max(100_000) }),
  z.object({ action: z.literal("record_cod_collection"), handoverId: objectId, amount: z.number().min(0).max(1_000_000_000) }),
  z.object({ action: z.literal("settle_cod"), handoverId: objectId, amount: z.number().min(0).max(1_000_000_000) }),
  z.object({ action: z.literal("read_notifications") }),
]);

const statusTransitions: Record<string, string[]> = {
  shipped: ["delivered", "failed"],
  failed: ["delivered"],
};

type Context = { params: Promise<{ id: string }> };
type Action = z.infer<typeof schema>;

class DeliveryActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function audit(order: { deliveryAudit: { hash: string }[] }, id: string, actor: { id: string; role: "super_admin" | "admin" | "vendor" | "delivery_staff" | "customer" }, event: string, details = "") {
  order.deliveryAudit.push(createDeliveryAuditEntry(id, order.deliveryAudit.at(-1)?.hash ?? "", actor, event, details));
}

async function confirmReturn(
  id: string,
  returnId: string,
  condition: "good" | "damaged" | "disputed",
  actor: { id: string; role: "super_admin" | "admin" | "vendor" | "delivery_staff" | "customer" },
) {
  const session = await mongoose.startSession();
  let saved: unknown;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);
      if (!order) throw new DeliveryActionError("Order not found", 404);
      const receipt = order.delivery.returns.find((entry) => String(entry._id ?? "") === returnId);
      if (!receipt) throw new DeliveryActionError("Return receipt not found", 404);
      if (receipt.status === "confirmed") throw new DeliveryActionError("Return receipt is already confirmed", 409);

      if (condition === "good") {
        const filter = receipt.variantId
          ? { _id: receipt.productId, variants: { $elemMatch: { _id: receipt.variantId } } }
          : { _id: receipt.productId, $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] };
        const update = receipt.variantId
          ? { $inc: { stock: receipt.countedQuantity, "variants.$.stock": receipt.countedQuantity } }
          : { $inc: { stock: receipt.countedQuantity } };
        const result = await Product.updateOne(filter, update, { session });
        if (result.matchedCount !== 1) throw new DeliveryActionError("Product or option was not found; return was not confirmed or restocked", 409);
        receipt.restockAppliedAt = new Date();
      }

      receipt.condition = condition;
      receipt.status = "confirmed";
      receipt.confirmedBy = actor.id;
      receipt.confirmedAt = new Date();
      if (receipt.handoverId) {
        const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === String(receipt.handoverId));
        if (!handover || handover.returnedQuantity + receipt.countedQuantity > handover.acceptedQuantity) {
          throw new DeliveryActionError("Return count exceeds accepted handover quantity", 409);
        }
        handover.returnedQuantity += receipt.countedQuantity;
      }
      audit(order, id, actor, "admin_confirmed_physical_return_count", `${returnId}; condition ${condition}${condition === "good" ? "; stock restored" : "; not restocked"}`);
      await order.save({ session });
      saved = order;
    });
  } finally {
    await session.endSession();
  }
  return saved;
}

export async function POST(request: Request, { params }: Context) {
  const access = await requireUser(["super_admin", "admin", "vendor", "delivery_staff", "customer"]);
  if ("error" in access) return access.error;
  const admin = access.user.role !== "vendor" && access.user.role !== "customer" && hasPermission(access.user, "manage_bookings");
  const deliveryActor = admin || access.user.role === "vendor" || access.user.role === "delivery_staff";
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!objectId.safeParse(id).success) return Response.json({ error: "Invalid order id" }, { status: 400 });
    const action: Action = parsed.data;
    if (action.action === "report" && !rateLimit(clientKey(request, "delivery-report"), 6)) {
      return Response.json({ error: "Too many delivery reports. Please try again later." }, { status: 429 });
    }

    const adminOnly = ["resolve_report", "request_verification", "verify", "confirm_return", "assign_handover", "verify_handover", "reconcile_handover", "settle_cod"].includes(action.action);
    if (adminOnly && !admin) return Response.json({ error: "Admin permission required" }, { status: 403 });
    if (action.action === "report" || action.action === "read_notifications") {
      if (access.user.role !== "customer") return Response.json({ error: "Customer access required" }, { status: 403 });
    } else if (!adminOnly && !deliveryActor) {
      return Response.json({ error: "Delivery staff access required" }, { status: 403 });
    }
    if (access.user.role === "delivery_staff" && action.action !== "delivered" && action.action !== "failed") {
      return Response.json({ error: "Delivery staff can only update their assigned order outcome" }, { status: 403 });
    }

    await connectDb();
    if (action.action === "confirm_return") {
      const item = await confirmReturn(id, action.returnId, action.condition, access.user);
      return Response.json({ item });
    }
    const order = await Order.findById(id);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const actorId = access.user.id;
    const assignedToDeliveryStaff = access.user.role === "delivery_staff" && order.delivery.assignment?.assignedTo === actorId;
    if (access.user.role === "delivery_staff" && !assignedToDeliveryStaff) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    if (action.action === "report") {
      const ownsOrder = String(order.customer ?? "") === actorId ||
        Boolean(order.customerInfo.email && order.customerInfo.email.toLowerCase() === access.user.email.toLowerCase());
      if (!ownsOrder) return Response.json({ error: "Order not found" }, { status: 404 });
      if (action.requestId && order.delivery.reports.some((entry) => entry.requestId === action.requestId)) {
        return Response.json({ error: "This report was already received" }, { status: 409 });
      }
      order.delivery.reports.push({
        customerId: actorId,
        ...(action.requestId ? { requestId: action.requestId } : {}),
        reason: action.reason,
        ...(action.details ? { details: action.details } : {}),
        createdAt: new Date(),
        status: "open",
      });
      audit(order, id, access.user, "customer_reported_delivery_issue", action.reason);
    } else if (action.action === "read_notifications") {
      const ownsOrder = String(order.customer ?? "") === actorId ||
        Boolean(order.customerInfo.email && order.customerInfo.email.toLowerCase() === access.user.email.toLowerCase());
      if (!ownsOrder) return Response.json({ error: "Order not found" }, { status: 404 });
      const readAt = new Date();
      for (const notification of order.delivery.notifications) if (!notification.readAt) notification.readAt = readAt;
    } else if (action.action === "delivered" || action.action === "failed") {
      const affected = order.items.filter((item) => {
        const handovers = order.delivery.handovers.filter((entry) => String(entry.productId) === String(item.productId) && String(entry.variantId ?? "") === String(item.variantId ?? ""));
        const assignedToActor = handovers.some((entry) => entry.assignedTo === actorId);
        if ((!admin && !assignedToDeliveryStaff && String(item.vendorId ?? "") !== actorId && !assignedToActor) || !statusTransitions[item.status]?.includes(action.action)) return false;
        return !handovers.length || handovers.some((entry) => entry.assignedTo === actorId && Boolean(entry.acceptedAt));
      });
      if (!affected.length) return Response.json({ error: "No eligible shipped items were found for this delivery update" }, { status: 409 });
      for (const item of affected) {
        const handovers = order.delivery.handovers.filter((entry) => String(entry.productId) === String(item.productId) && String(entry.variantId ?? "") === String(item.variantId ?? "") && entry.assignedTo === actorId && entry.acceptedAt);
        if (action.action === "delivered" && handovers.length) {
          for (const handover of handovers) handover.deliveredQuantity = handover.acceptedQuantity;
          const reportedDelivered = order.delivery.handovers
            .filter((entry) => String(entry.productId) === String(item.productId) && String(entry.variantId ?? "") === String(item.variantId ?? ""))
            .reduce((sum, entry) => sum + entry.deliveredQuantity, 0);
          if (reportedDelivered >= item.quantity) item.status = "delivered";
        } else {
          item.status = action.action;
        }
      }
      order.status = aggregateOrderStatus(order.items.map((item) => item.status));
      if (action.action === "delivered") {
        order.delivery.deliveredAt = new Date();
        order.delivery.deliveredBy = actorId;
        order.delivery.notes = action.notes;
        order.delivery.failedAt = undefined;
        order.delivery.failedBy = undefined;
        order.delivery.failedReason = "";
        if (action.notifyCustomer) order.delivery.notifications.push({ message: "Your order has been marked as delivered.", createdAt: new Date() });
      } else {
        order.delivery.failedAt = new Date();
        order.delivery.failedBy = actorId;
        order.delivery.failedReason = action.reason;
      }
      const details = action.action === "delivered" ? action.notes : action.reason;
      audit(order, id, access.user, `delivery_${action.action}`, `${details}${details ? "; " : ""}items: ${affected.length}`);
      if (action.action === "delivered") await maybeRequestAutomaticDeliveryAudit(order, id, access.user);
    } else if (action.action === "request_verification") {
      if (order.delivery.verificationStatus === "pending") return Response.json({ error: "A verification request is already open" }, { status: 409 });
      order.delivery.verificationStatus = "pending";
      audit(order, id, access.user, "admin_verification_requested", action.reason);
    } else if (action.action === "verify") {
      if (order.delivery.verificationStatus !== "pending") return Response.json({ error: "No pending delivery verification exists" }, { status: 409 });
      order.delivery.verificationStatus = action.status;
      if (action.status === "verified") {
        for (const handover of order.delivery.handovers) handover.verifiedDeliveredQuantity = handover.deliveredQuantity;
      }
      audit(order, id, access.user, `admin_verification_${action.status}`, action.notes);
    } else if (action.action === "resolve_report") {
      const report = order.delivery.reports.find((entry) => String(entry._id ?? "") === action.reportId);
      if (!report) return Response.json({ error: "Delivery report not found" }, { status: 404 });
      if (report.status === "resolved") return Response.json({ error: "Delivery report is already resolved" }, { status: 409 });
      report.status = "resolved";
      report.resolvedBy = actorId;
      report.resolvedAt = new Date();
      audit(order, id, access.user, "customer_delivery_report_resolved", action.reportId);
    } else if (action.action === "assign_handover") {
      if (order.delivery.assignment) {
        return Response.json({ error: "This order already has an order-level delivery staff assignment" }, { status: 409 });
      }
      const target = await User.findOne({
        _id: action.assignedTo,
        status: "active",
        $or: [{ role: "vendor" }, { role: "admin", permissions: "manage_bookings" }],
      }).select("_id");
      if (!target) return Response.json({ error: "Assigned delivery actor is not active or eligible" }, { status: 400 });
      const line = order.items.find((item) => String(item.productId) === action.productId && String(item.variantId ?? "") === (action.variantId ?? ""));
      if (!line || line.status !== "shipped") return Response.json({ error: "Only shipped order items can be assigned" }, { status: 409 });
      const assigned = order.delivery.handovers
        .filter((entry) => String(entry.productId) === action.productId && String(entry.variantId ?? "") === (action.variantId ?? ""))
        .reduce((sum, entry) => sum + entry.assignedQuantity, 0);
      if (assigned + action.assignedQuantity > line.quantity) return Response.json({ error: "Assigned quantity exceeds the order quantity" }, { status: 400 });
      order.delivery.handovers.push({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        title: line.title,
        assignedTo: action.assignedTo,
        assignedBy: actorId,
        assignedQuantity: action.assignedQuantity,
        acceptedQuantity: 0,
        deliveredQuantity: 0,
        verifiedDeliveredQuantity: 0,
        returnedQuantity: 0,
        missingQuantity: 0,
        disputedQuantity: 0,
        codDue: line.unitPrice * action.assignedQuantity,
        codCollected: 0,
        codSettled: 0,
        codDisputed: 0,
      });
      audit(order, id, access.user, "delivery_handover_assigned", `${action.assignedQuantity} ${line.title}; actor ${action.assignedTo}`);
    } else if (action.action === "accept_handover") {
      const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === action.handoverId);
      if (!handover || handover.assignedTo !== actorId) return Response.json({ error: "Handover not found for this delivery actor" }, { status: 404 });
      if (handover.acceptedAt) return Response.json({ error: "Handover has already been accepted" }, { status: 409 });
      if (action.acceptedQuantity > handover.assignedQuantity) return Response.json({ error: "Accepted quantity cannot exceed the assigned quantity" }, { status: 400 });
      handover.acceptedQuantity = action.acceptedQuantity;
      handover.acceptedAt = new Date();
      audit(order, id, access.user, "delivery_handover_physically_accepted", `${action.acceptedQuantity}/${handover.assignedQuantity} ${handover.title}`);
    } else if (action.action === "verify_handover") {
      const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === action.handoverId);
      if (!handover || !handover.acceptedAt) return Response.json({ error: "Accepted handover not found" }, { status: 404 });
      if (action.verifiedQuantity < handover.verifiedDeliveredQuantity || action.verifiedQuantity > handover.deliveredQuantity) {
        return Response.json({ error: "Verified delivered quantity must be between the already verified and staff-reported quantity" }, { status: 400 });
      }
      handover.verifiedDeliveredQuantity = action.verifiedQuantity;
      audit(order, id, access.user, "admin_verified_delivered_quantity", `${action.verifiedQuantity} ${handover.title}`);
    } else if (action.action === "reconcile_handover") {
      const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === action.handoverId);
      if (!handover || !handover.acceptedAt) return Response.json({ error: "Accepted handover not found" }, { status: 404 });
      const accounted = handover.verifiedDeliveredQuantity + handover.returnedQuantity + handover.missingQuantity + handover.disputedQuantity;
      if (accounted + action.missingQuantity + action.disputedQuantity > handover.acceptedQuantity) {
        return Response.json({ error: "Missing and disputed quantities exceed the unaccounted accepted quantity" }, { status: 400 });
      }
      handover.missingQuantity += action.missingQuantity;
      handover.disputedQuantity += action.disputedQuantity;
      audit(order, id, access.user, "admin_reconciled_handover_quantities", `${action.missingQuantity} missing; ${action.disputedQuantity} disputed; ${handover.title}`);
    } else if (action.action === "record_cod_collection") {
      const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === action.handoverId);
      if (!handover || handover.assignedTo !== actorId || !handover.acceptedAt) return Response.json({ error: "Accepted handover not found for this delivery actor" }, { status: 404 });
      if (handover.settledAt || handover.codCollected + action.amount > handover.codDue) return Response.json({ error: "COD collection exceeds the amount due or is already settled" }, { status: 409 });
      handover.codCollected += action.amount;
      audit(order, id, access.user, "delivery_staff_reported_cod_collection", `${action.amount} of ${handover.codDue} for ${handover.title}`);
    } else if (action.action === "settle_cod") {
      const handover = order.delivery.handovers.find((entry) => String(entry._id ?? "") === action.handoverId);
      if (!handover || !handover.acceptedAt) return Response.json({ error: "Accepted handover not found" }, { status: 404 });
      if (handover.settledAt) return Response.json({ error: "COD settlement was already recorded" }, { status: 409 });
      if (action.amount > handover.codDue) return Response.json({ error: "Settled amount cannot exceed COD due" }, { status: 400 });
      handover.codSettled = action.amount;
      handover.codDisputed = Math.abs(action.amount - handover.codCollected);
      handover.settledAt = new Date();
      handover.settledBy = actorId;
      audit(order, id, access.user, "admin_physically_settled_cod", `${action.amount} settled; ${handover.codDisputed} disputed`);
    } else if (action.action === "record_return") {
      if (!order.items.some((item) => item.status === "delivered" || item.status === "failed" || item.status === "shipped")) {
        return Response.json({ error: "Returned products can only be recorded after a delivery attempt" }, { status: 409 });
      }
      const duplicate = new Set(action.items.map((line) => `${line.productId}:${line.variantId ?? ""}`));
      if (duplicate.size !== action.items.length) return Response.json({ error: "Each returned product option can only be counted once" }, { status: 400 });
      const receipt = [];
      for (const line of action.items) {
        const orderLine = order.items.find((item) => String(item.productId) === line.productId && String(item.variantId ?? "") === (line.variantId ?? ""));
        const assignedByActor = order.delivery.handovers.some((entry) =>
          String(entry.productId) === line.productId &&
          String(entry.variantId ?? "") === (line.variantId ?? "") &&
          entry.assignedTo === actorId,
        );
        if (!orderLine || (!admin && String(orderLine.vendorId ?? "") !== actorId && !assignedByActor)) {
          return Response.json({ error: "A returned product does not belong to this order or delivery actor" }, { status: 403 });
        }
        const previouslyCounted = order.delivery.returns
          .filter((entry) => String(entry.productId) === line.productId && String(entry.variantId ?? "") === (line.variantId ?? ""))
          .reduce((total, entry) => total + entry.countedQuantity, 0);
        if (previouslyCounted + line.countedQuantity > orderLine.quantity) {
          return Response.json({ error: `Total return count for ${orderLine.title} cannot exceed the ordered quantity` }, { status: 400 });
        }
        const handover = line.handoverId
          ? order.delivery.handovers.find((entry) => String(entry._id ?? "") === line.handoverId)
          : order.delivery.handovers.find((entry) => String(entry.productId) === line.productId && String(entry.variantId ?? "") === (line.variantId ?? "") &&
            (admin || entry.assignedTo === actorId) && entry.acceptedQuantity - entry.returnedQuantity >= line.countedQuantity);
        if (line.handoverId && (!handover || (!admin && handover.assignedTo !== actorId))) return Response.json({ error: "Handover not found for this return" }, { status: 404 });
        if (handover && handover.acceptedQuantity - handover.returnedQuantity < line.countedQuantity) {
          return Response.json({ error: `Return count exceeds the accepted quantity for ${orderLine.title}` }, { status: 400 });
        }
        receipt.push({
          productId: orderLine.productId,
          ...(orderLine.variantId ? { variantId: orderLine.variantId } : {}),
          ...(handover?._id ? { handoverId: handover._id } : {}),
          title: orderLine.title,
          expectedQuantity: orderLine.quantity,
          countedQuantity: line.countedQuantity,
          receivedBy: actorId,
          receivedAt: new Date(),
          ...(action.notes ? { notes: action.notes } : {}),
          status: "pending_confirmation" as const,
        });
      }
      order.delivery.returns.push(...receipt);
      audit(order, id, access.user, "return_products_physically_counted", `${receipt.length} product line(s); awaiting admin condition check`);
    }

    await order.save();
    return Response.json({ item: order });
  } catch (error) {
    if (error instanceof DeliveryActionError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "VersionError") {
      return Response.json({ error: "This order changed at the same time. Refresh and try again." }, { status: 409 });
    }
    return apiError(error);
  }
}
