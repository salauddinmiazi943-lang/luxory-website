import { createHash, createHmac } from "node:crypto";
import type { AppRole } from "@/lib/models";
export type DeliveryActorRole = AppRole;

export type DeliveryAuditEntry = {
  orderId: string;
  actorId: string;
  actorRole: DeliveryActorRole;
  event: string;
  occurredAt: Date;
  previousHash: string;
  hash: string;
  signature?: string;
  details?: string;
};

function hashEntry(entry: Omit<DeliveryAuditEntry, "hash" | "signature">) {
  return createHash("sha256").update(JSON.stringify({
    orderId: entry.orderId,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    event: entry.event,
    occurredAt: entry.occurredAt.toISOString(),
    previousHash: entry.previousHash,
    details: entry.details ?? "",
  })).digest("hex");
}

function signHash(hash: string) {
  const secret = process.env.DELIVERY_AUDIT_SECRET;
  return secret && secret.length >= 32
    ? createHmac("sha256", secret).update(hash).digest("hex")
    : undefined;
}

export function createDeliveryAuditEntry(
  orderId: string,
  previousHash: string,
  actor: { id: string; role: AppRole },
  event: string,
  details?: string,
): DeliveryAuditEntry {
  const entry = {
    orderId,
    actorId: actor.id,
    actorRole: actor.role,
    event,
    occurredAt: new Date(),
    previousHash,
    ...(details ? { details } : {}),
  };
  const hash = hashEntry(entry);
  const signature = signHash(hash);
  return { ...entry, hash, ...(signature ? { signature } : {}) };
}

export function verifyDeliveryAudit(orderId: string, history: DeliveryAuditEntry[]) {
  let previousHash = "";
  for (const entry of history) {
    const { hash, signature, ...data } = entry;
    if (data.orderId !== orderId || data.previousHash !== previousHash || hashEntry(data) !== hash) return false;
    if (signature && signHash(hash) !== signature) return false;
    previousHash = hash;
  }
  return true;
}

export function auditProtectionMode() {
  return process.env.DELIVERY_AUDIT_SECRET && process.env.DELIVERY_AUDIT_SECRET.length >= 32
    ? "signed"
    : "hash-only";
}
