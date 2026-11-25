import { connectDb } from "@/lib/db";
import { DeliverySettings } from "@/lib/models";

export const DEFAULT_INSIDE_DHAKA_CHARGE = 60;
export const DEFAULT_OUTSIDE_DHAKA_CHARGE = 120;
export const DEFAULT_FREE_DELIVERY_THRESHOLD = 5000;

export type DeliveryRuleConfig = {
  deliveryChargeEnabled: boolean;
  insideDhakaCharge: number;
  outsideDhakaCharge: number;
  freeDeliveryEnabled: boolean;
  freeDeliveryThreshold: number;
};

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function resolveDeliveryRuleConfig(): Promise<DeliveryRuleConfig> {
  try {
    await connectDb();
    const settings = await DeliverySettings.findOne().lean().catch(() => null) as Record<string, unknown> | null;
    const inside = num(settings?.insideDhakaCharge ?? settings?.defaultDeliveryCharge, DEFAULT_INSIDE_DHAKA_CHARGE);
    return {
      deliveryChargeEnabled: settings?.deliveryChargeEnabled !== false,
      insideDhakaCharge: inside,
      outsideDhakaCharge: num(settings?.outsideDhakaCharge, DEFAULT_OUTSIDE_DHAKA_CHARGE),
      freeDeliveryEnabled: Boolean(settings?.freeDeliveryEnabled),
      freeDeliveryThreshold: num(settings?.freeDeliveryThreshold, DEFAULT_FREE_DELIVERY_THRESHOLD),
    };
  } catch {
    return {
      deliveryChargeEnabled: true,
      insideDhakaCharge: DEFAULT_INSIDE_DHAKA_CHARGE,
      outsideDhakaCharge: DEFAULT_OUTSIDE_DHAKA_CHARGE,
      freeDeliveryEnabled: false,
      freeDeliveryThreshold: DEFAULT_FREE_DELIVERY_THRESHOLD,
    };
  }
}

export function calculateDeliveryCharge(config: DeliveryRuleConfig, subtotal: number, area: "inside_dhaka" | "outside_dhaka") {
  if (!config.deliveryChargeEnabled) return 0;
  if (config.freeDeliveryEnabled && subtotal >= config.freeDeliveryThreshold) return 0;
  return area === "inside_dhaka" ? config.insideDhakaCharge : config.outsideDhakaCharge;
}

export async function resolveDefaultDeliveryCharge() {
  const config = await resolveDeliveryRuleConfig();
  return config.insideDhakaCharge;
}
