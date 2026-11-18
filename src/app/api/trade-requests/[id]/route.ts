import { z } from "zod";
import { connectDb } from "@/lib/db";
import { TradeOrderRequest } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const statuses = ["new_request", "discussion", "price_negotiation", "approved", "rejected", "order_confirmed", "completed"] as const;

const patchSchema = z.object({
  action: z.enum(["message", "admin_update", "mark_read"]),
  body: z.string().trim().min(1).max(4000).optional(),
  status: z.enum(statuses).optional(),
  negotiationNote: z.string().trim().max(2000).optional(),
  proposedDeliveryCharge: z.number().min(0).max(10_000_000).optional(),
  proposedTotal: z.number().min(0).max(1_000_000_000).optional(),
  proposedItems: z.array(z.object({
    title: z.string().trim().max(300).default(""),
    quantity: z.number().min(0).max(1_000_000).optional(),
    unitPrice: z.number().min(0).max(100_000_000).optional(),
    note: z.string().trim().max(300).optional().default(""),
  })).max(100).optional(),
});

type Context = { params: Promise<{ id: string }> };
function isAdmin(role: string) { return role === "admin" || role === "super_admin"; }

export async function GET(_request: Request, { params }: Context) {
  const access = await requireUser();
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
    await connectDb();
    const item = await TradeOrderRequest.findById(id).lean();
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    const admin = isAdmin(access.user.role);
    const owner = String(item.requester) === access.user.id && (access.user.role === "reseller" || access.user.role === "wholesaler");
    if (!admin && !owner) return Response.json({ error: "Forbidden" }, { status: 403 });
    return Response.json({ item });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await requireUser();
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, patchSchema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
    await connectDb();
    const item = await TradeOrderRequest.findById(id);
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    const admin = isAdmin(access.user.role);
    const owner = String(item.requester) === access.user.id && (access.user.role === "reseller" || access.user.role === "wholesaler");
    if (!admin && !owner) return Response.json({ error: "Forbidden" }, { status: 403 });

    if (parsed.data.action === "mark_read") {
      if (admin) item.adminUnread = false;
      if (owner) item.requesterUnread = false;
      item.messages = (item.messages as unknown as { toObject?: () => unknown }[]).map((m) => ({ ...(m.toObject ? m.toObject() as Record<string, unknown> : m as Record<string, unknown>), ...(admin ? { readByAdmin: true } : {}), ...(owner ? { readByRequester: true } : {}) })) as typeof item.messages;
      await item.save();
      return Response.json({ item });
    }

    if (parsed.data.action === "message") {
      const body = (parsed.data.body ?? "").trim();
      if (!body) return Response.json({ error: "Message body is required" }, { status: 400 });
      (item.messages as unknown[]).push({ senderId: access.user.id, senderRole: access.user.role, senderName: access.user.name, body, readByAdmin: admin, readByRequester: owner, createdAt: new Date() });
      if (admin) { item.requesterUnread = true; item.adminUnread = false; }
      if (owner) { item.adminUnread = true; item.requesterUnread = false; if (item.status === "new_request") item.status = "discussion"; }
      await item.save();
      return Response.json({ item });
    }

    if (parsed.data.action === "admin_update") {
      if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.negotiationNote !== undefined) item.negotiationNote = parsed.data.negotiationNote;
      if (parsed.data.proposedDeliveryCharge !== undefined) item.proposedDeliveryCharge = parsed.data.proposedDeliveryCharge;
      if (parsed.data.proposedTotal !== undefined) item.proposedTotal = parsed.data.proposedTotal;
      if (parsed.data.proposedItems !== undefined) item.proposedItems = parsed.data.proposedItems as typeof item.proposedItems;
      if (parsed.data.body && parsed.data.body.trim()) {
        (item.messages as unknown[]).push({ senderId: access.user.id, senderRole: access.user.role, senderName: access.user.name, body: parsed.data.body.trim(), readByAdmin: true, readByRequester: false, createdAt: new Date() });
        item.requesterUnread = true; item.adminUnread = false;
      }
      await item.save();
      return Response.json({ item });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) { return apiError(error); }
}
