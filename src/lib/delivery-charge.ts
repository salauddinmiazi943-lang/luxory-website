import { connectDb } from "@/lib/db";
import { DeliverySettings } from "@/lib/models";

export const DEFAULT_DELIVERY_CHARGE = 60;

export async function resolveDefaultDeliveryCharge() {
  try {
    await connectDb();
    const settings = await DeliverySettings.findOne().select("defaultDeliveryCharge").lean().catch(() => null);
    const value = Number(settings?.defaultDeliveryCharge);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DELIVERY_CHARGE;
  } catch {
    return DEFAULT_DELIVERY_CHARGE;
  }
}
