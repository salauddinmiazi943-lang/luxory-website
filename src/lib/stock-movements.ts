import mongoose from "mongoose";
import { StockMovement } from "@/lib/models";

export type StockMovementReason =
  | "product_created"
  | "product_updated"
  | "order_placed"
  | "order_cancelled"
  | "order_rollback"
  | "return_restocked";

export type StockMovementInput = {
  productId: string | mongoose.Types.ObjectId;
  variantId?: string | mongoose.Types.ObjectId | null;
  productTitle?: string;
  variantLabel?: string;
  delta: number;
  stockBefore?: number | null;
  stockAfter?: number | null;
  reason: StockMovementReason;
  orderId?: string | mongoose.Types.ObjectId | null;
  actorId?: string | null;
  actorRole?: string;
  note?: string;
};

function toObjectId(value: string | mongoose.Types.ObjectId | null | undefined) {
  if (!value) return undefined;
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : undefined;
}

export async function recordStockMovements(entries: StockMovementInput[]) {
  const rows = entries.filter((entry) => Number.isFinite(entry.delta) && entry.delta !== 0 && mongoose.isValidObjectId(entry.productId));
  if (!rows.length) return;

  try {
    await StockMovement.insertMany(rows.map((entry) => ({
      productId: toObjectId(entry.productId),
      variantId: toObjectId(entry.variantId),
      productTitle: (entry.productTitle ?? "").slice(0, 300),
      variantLabel: (entry.variantLabel ?? "").slice(0, 60),
      delta: entry.delta,
      stockBefore: typeof entry.stockBefore === "number" ? entry.stockBefore : null,
      stockAfter: typeof entry.stockAfter === "number" ? entry.stockAfter : null,
      reason: entry.reason,
      orderId: toObjectId(entry.orderId),
      actorId: toObjectId(entry.actorId),
      actorRole: (entry.actorRole ?? "").slice(0, 32),
      note: (entry.note ?? "").slice(0, 500),
    })), { ordered: false });
  } catch (error) {
    console.error("Could not record stock movements.", error);
  }
}

export function stockDelta(before: number | null | undefined, after: number | null | undefined) {
  if (typeof before !== "number" || typeof after !== "number") return 0;
  return after - before;
}