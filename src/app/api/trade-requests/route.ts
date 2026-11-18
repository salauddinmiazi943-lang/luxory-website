import { z } from "zod";
import { connectDb } from "@/lib/db";
import { TradeOrderRequest } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const itemSchema = z.object({
  productId: z.string().trim().max(64).optional().default(""),
  title: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().max(30).optional().default(""),
  variantLabel: z.string().trim().max(120).optional().default(""),
  requestedVariant: z.string().trim().max(300).optional().default(""),
  image: z.string().trim().max(2000).optional().default(""),
});

const createSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  contactNumber: z.string().trim().min(6).max(40),
  deliveryLocation: z.string().trim().min(3).max(1000),
  customerMessage: z.string().trim().max(4000).optional().default(""),
});

export async function GET() {
  const access = await requireUser();
  if ("error" in access) return access.error;
  try {
    await connectDb();
    if (access.user.role === "super_admin" || access.user.role === "admin") {
      const items = await TradeOrderRequest.find().sort({ createdAt: -1 }).lean();
      return Response.json({ items });
    }
    if (access.user.role === "reseller" || access.user.role === "wholesaler") {
      const items = await TradeOrderRequest.find({ requester: access.user.id }).sort({ createdAt: -1 }).lean();
      return Response.json({ items });
    }
    return Response.json({ error: "Forbidden" }, { status: 403 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requireUser(["reseller", "wholesaler"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, createSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const doc = await TradeOrderRequest.create({
      requester: access.user.id,
      requesterRole: access.user.role,
      requesterName: access.user.name,
      requesterEmail: access.user.email,
      contactNumber: parsed.data.contactNumber,
      deliveryLocation: parsed.data.deliveryLocation,
      customerMessage: parsed.data.customerMessage ?? "",
      items: parsed.data.items,
      status: "new_request",
      messages: [],
      adminUnread: true,
      requesterUnread: false,
    });
    return Response.json({ item: doc }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
