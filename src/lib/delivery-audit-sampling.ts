import { DeliverySettings } from "@/lib/models";
import { createDeliveryAuditEntry } from "@/lib/delivery-audit";
import type { AppRole } from "@/lib/models";

type AuditableOrder = {
  delivery: { verificationStatus: string };
  deliveryAudit: { event: string; hash: string }[];
};

export async function maybeRequestAutomaticDeliveryAudit(
  order: AuditableOrder,
  orderId: string,
  actor: { id: string; role: AppRole },
) {
  if (order.delivery.verificationStatus !== "not_required" ||
    order.deliveryAudit.some((entry) => entry.event === "automatic_delivery_audit_requested")) return;
  const settings = await DeliverySettings.findOne().select("auditFrequencyPercent").lean();
  const frequency = settings?.auditFrequencyPercent ?? 0;
  if (frequency <= 0 || Math.random() * 100 >= frequency) return;
  order.delivery.verificationStatus = "pending";
  order.deliveryAudit.push(createDeliveryAuditEntry(
    orderId,
    order.deliveryAudit.at(-1)?.hash ?? "",
    actor,
    "automatic_delivery_audit_requested",
    `Sampling frequency ${frequency}%`,
  ));
}
