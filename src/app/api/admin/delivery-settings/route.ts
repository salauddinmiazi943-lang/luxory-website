import { z } from "zod";
import { connectDb } from "@/lib/db";
import { DeliverySettings } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  auditFrequencyPercent: z.number().int().min(0).max(100).optional(),
  defaultDeliveryCharge: z.number().min(0).max(100000).optional(),
}).refine((v) => v.auditFrequencyPercent !== undefined || v.defaultDeliveryCharge !== undefined, {
  message: "No delivery setting provided",
});

function normalize(settings: { auditFrequencyPercent?: number; defaultDeliveryCharge?: number; updatedAt?: Date } | null) {
  return {
    auditFrequencyPercent: settings?.auditFrequencyPercent ?? 0,
    defaultDeliveryCharge: settings?.defaultDeliveryCharge ?? 60,
    updatedAt: settings?.updatedAt ?? null,
    notifications: {
      inSite: true,
      emailConfigured: Boolean(process.env.DELIVERY_EMAIL_PROVIDER_URL && process.env.DELIVERY_EMAIL_API_KEY),
      smsConfigured: Boolean(process.env.DELIVERY_SMS_PROVIDER_URL && process.env.DELIVERY_SMS_API_KEY),
      externalDeliveryEnabled: false,
    },
  };
}

export async function GET() {
  const access = await requirePermission("manage_bookings");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const settings = await DeliverySettings.findOne().lean();
    return Response.json(normalize(settings as Parameters<typeof normalize>[0]));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await requirePermission("manage_bookings");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const settings = await DeliverySettings.findOneAndUpdate(
      {},
      { $set: { ...parsed.data, updatedBy: access.user.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return Response.json({ auditFrequencyPercent: settings.auditFrequencyPercent, defaultDeliveryCharge: settings.defaultDeliveryCharge ?? 60, updatedAt: settings.updatedAt });
  } catch (error) {
    return apiError(error);
  }
}
