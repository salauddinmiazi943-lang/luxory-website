import { z } from "zod";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { DeliverySettings } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  auditFrequencyPercent: z.number().int().min(0).max(100).optional(),
  defaultDeliveryCharge: z.number().min(0).max(100000).optional(),
  deliveryChargeEnabled: z.boolean().optional(),
  insideDhakaCharge: z.number().min(0).max(100000).optional(),
  outsideDhakaCharge: z.number().min(0).max(100000).optional(),
  freeDeliveryEnabled: z.boolean().optional(),
  freeDeliveryThreshold: z.number().min(0).max(10000000).optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), {
  message: "No delivery setting provided",
});

function normalize(settings: Record<string, unknown> | null) {
  const inside = Number(settings?.insideDhakaCharge ?? settings?.defaultDeliveryCharge ?? 60);
  return {
    auditFrequencyPercent: Number(settings?.auditFrequencyPercent ?? 0),
    deliveryChargeEnabled: settings?.deliveryChargeEnabled !== false,
    insideDhakaCharge: Number.isFinite(inside) && inside >= 0 ? inside : 60,
    outsideDhakaCharge: Number(settings?.outsideDhakaCharge ?? 120),
    freeDeliveryEnabled: Boolean(settings?.freeDeliveryEnabled),
    freeDeliveryThreshold: Number(settings?.freeDeliveryThreshold ?? 5000),
    defaultDeliveryCharge: Number.isFinite(inside) && inside >= 0 ? inside : 60,
    updatedAt: (settings?.updatedAt as Date | undefined) ?? null,
    notifications: {
      inSite: true,
      emailConfigured: Boolean(process.env.DELIVERY_EMAIL_PROVIDER_URL && process.env.DELIVERY_EMAIL_API_KEY),
      smsConfigured: Boolean(process.env.DELIVERY_SMS_PROVIDER_URL && process.env.DELIVERY_SMS_API_KEY),
      externalDeliveryEnabled: false,
    },
  };
}

export async function GET() {
  try {
    const access = await requirePermission("manage_bookings");
    if ("error" in access) return access.error;
    await connectDb();
    const settings = await DeliverySettings.findOne().lean();
    return NextResponse.json(normalize(settings as Record<string, unknown> | null));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requirePermission("manage_bookings");
    if ("error" in access) return access.error;
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const set: Record<string, unknown> = { ...parsed.data, updatedBy: access.user.id };
    if (typeof parsed.data.insideDhakaCharge === "number") set.defaultDeliveryCharge = parsed.data.insideDhakaCharge;
    const settings = await DeliverySettings.findOneAndUpdate(
      {},
      { $set: set },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json(normalize(settings as Record<string, unknown> | null));
  } catch (error) {
    return apiError(error);
  }
}
