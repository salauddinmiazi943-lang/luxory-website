import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";
import { verifyDeliveryAccessKey } from "@/lib/delivery-security";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const schema = z.object({
  accessKey: z.string().min(40).max(64),
  requestId: z.string().uuid(),
  reason: z.enum(["not_received", "late", "missing_items", "damaged", "other"]),
  details: z.string().trim().max(1000).default(""),
});
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!objectId.safeParse(id).success) return Response.json({ error: "Order or access key is invalid" }, { status: 404 });
  if (!rateLimit(clientKey(request, `guest-delivery-report:${id}`), 6, 15 * 60_000)) {
    return Response.json({ error: "Too many report attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const order = await Order.findById(id).select("+delivery.accessKeyHash");
    if (!order || order.customer || !verifyDeliveryAccessKey(parsed.data.accessKey, order.delivery.accessKeyHash)) {
      return Response.json({ error: "Order or access key is invalid" }, { status: 404 });
    }
    if (!order.items.some((item) => ["shipped", "delivered", "failed", "partially_delivered"].includes(item.status))) {
      return Response.json({ error: "A delivery issue cannot be reported for this order yet" }, { status: 409 });
    }
    if (order.delivery.reports.some((report) => report.requestId === parsed.data.requestId)) {
      return Response.json({ error: "This report was already received" }, { status: 409 });
    }
    order.delivery.reports.push({
      customerId: "guest",
      requestId: parsed.data.requestId,
      reason: parsed.data.reason,
      ...(parsed.data.details ? { details: parsed.data.details } : {}),
      createdAt: new Date(),
      status: "open",
    });
    order.deliveryAudit.push(createDeliveryAuditEntry(
      id,
      order.deliveryAudit.at(-1)?.hash ?? "",
      { id: "guest", role: "customer" },
      "guest_reported_delivery_issue",
      parsed.data.reason,
    ));
    await order.save();
    return Response.json({ message: "Your delivery report was sent to our team." }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "VersionError") {
      return Response.json({ error: "This report was already received or the order changed. Refresh and try again." }, { status: 409 });
    }
    return apiError(error);
  }
}
