import type { OrderStatus } from "@/lib/models";

export type AggregateOrderStatus = OrderStatus | "partially_delivered";

export function aggregateOrderStatus(statuses: string[]): AggregateOrderStatus {
  if (!statuses.length) return "pending";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "delivered")) return "partially_delivered";
  if (statuses.every((status) => status === statuses[0])) return statuses[0] as OrderStatus;
  return "confirmed";
}
