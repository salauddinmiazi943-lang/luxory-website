import { z } from "zod";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { PaymentMethodSetting } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const METHODS = ["COD", "BKASH", "NAGAD", "ROCKET", "BANK"] as const;
const defaults: Record<string, { label: string; accountNumber: string; accountName: string; instructions: string }> = {
  COD: { label: "Cash on Delivery", accountNumber: "", accountName: "", instructions: "Pay when your order is delivered." },
  BKASH: { label: "bKash", accountNumber: process.env.NEXT_PUBLIC_BKASH_NUMBER?.trim() || "", accountName: process.env.NEXT_PUBLIC_BKASH_MERCHANT_LABEL?.trim() || "Send Money", instructions: "Send money and enter sender number and Transaction ID." },
  NAGAD: { label: "Nagad", accountNumber: "", accountName: "", instructions: "Send money and enter sender number and Transaction ID." },
  ROCKET: { label: "Rocket", accountNumber: "", accountName: "", instructions: "Send money and enter sender number and Transaction ID." },
  BANK: { label: "Bank Transfer", accountNumber: "", accountName: "", instructions: "Transfer to the account and enter sender/account info and Transaction/Reference ID." },
};

const patchSchema = z.object({
  methods: z.array(z.object({
    method: z.enum(METHODS),
    label: z.string().trim().max(120).optional(),
    enabled: z.boolean().optional(),
    accountNumber: z.string().trim().max(120).optional(),
    accountName: z.string().trim().max(120).optional(),
    instructions: z.string().trim().max(1000).optional(),
  })).min(1).max(10),
});

function merged(rows: Record<string, unknown>[]) {
  return METHODS.map((method) => {
    const def = defaults[method];
    const row = rows.find((r) => String(r.method) === method);
    return {
      method,
      label: String(row?.label || def.label),
      enabled: row?.enabled !== false,
      accountNumber: String(row?.accountNumber || def.accountNumber || ""),
      accountName: String(row?.accountName || def.accountName || ""),
      instructions: String(row?.instructions || def.instructions || ""),
    };
  });
}

export async function GET() {
  try {
    const access = await requirePermission("manage_bookings");
    if ("error" in access) return access.error;
    await connectDb();
    const rows = await PaymentMethodSetting.find().lean().catch(() => []);
    return NextResponse.json({ items: merged(rows as Record<string, unknown>[]) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requirePermission("manage_bookings");
    if ("error" in access) return access.error;
    const parsed = await readJson(request, patchSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    for (const item of parsed.data.methods) {
      const def = defaults[item.method];
      await PaymentMethodSetting.findOneAndUpdate(
        { method: item.method },
        { $set: {
          method: item.method,
          label: (item.label ?? def.label).trim() || def.label,
          enabled: item.enabled ?? true,
          accountNumber: (item.accountNumber ?? "").trim(),
          accountName: (item.accountName ?? "").trim(),
          instructions: (item.instructions ?? def.instructions).trim() || def.instructions,
          updatedBy: access.user.id,
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
      );
    }
    const rows = await PaymentMethodSetting.find().lean();
    return NextResponse.json({ items: merged(rows as Record<string, unknown>[]) });
  } catch (error) {
    return apiError(error);
  }
}
