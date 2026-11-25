import { apiError } from "@/lib/http";
import { resolveDeliveryRuleConfig } from "@/lib/delivery-charge";
import { connectDb } from "@/lib/db";
import { PaymentMethodSetting } from "@/lib/models";

const DEFAULT_PAYMENT_METHODS = [
  { method: "COD", label: "Cash on Delivery", enabled: true, accountNumber: "", accountName: "", instructions: "Pay when your order is delivered." },
  { method: "BKASH", label: "bKash", enabled: false, accountNumber: process.env.NEXT_PUBLIC_BKASH_NUMBER?.trim() || "", accountName: process.env.NEXT_PUBLIC_BKASH_MERCHANT_LABEL?.trim() || "Send Money", instructions: "Send money and enter sender number and Transaction ID." },
  { method: "NAGAD", label: "Nagad", enabled: false, accountNumber: "", accountName: "", instructions: "Send money and enter sender number and Transaction ID." },
  { method: "ROCKET", label: "Rocket", enabled: false, accountNumber: "", accountName: "", instructions: "Send money and enter sender number and Transaction ID." },
  { method: "BANK", label: "Bank Transfer", enabled: false, accountNumber: "", accountName: "", instructions: "Transfer to the account and enter sender/account info and Transaction/Reference ID." },
] as const;

export async function GET() {
  try {
    const delivery = await resolveDeliveryRuleConfig();
    let paymentMethods = DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
    await connectDb();
    const saved = await PaymentMethodSetting.find().lean();
    if (saved.length) {
      paymentMethods = DEFAULT_PAYMENT_METHODS.map((def) => {
        const row = saved.find((s: Record<string, unknown>) => String(s.method) === def.method) as Record<string, unknown> | undefined;
        if (!row) return { ...def };
        return {
          method: def.method,
          label: String(row.label || def.label),
          enabled: row.enabled !== false,
          accountNumber: String(row.accountNumber || def.accountNumber || ""),
          accountName: String(row.accountName || def.accountName || ""),
          instructions: String(row.instructions || def.instructions || ""),
        };
      });
    }
    return Response.json({ delivery, paymentMethods, defaultDeliveryCharge: delivery.insideDhakaCharge });
  } catch (error) {
    return apiError(error);
  }
}
