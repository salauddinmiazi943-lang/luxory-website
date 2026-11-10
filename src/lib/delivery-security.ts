import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createDeliveryAccessKey() {
  const key = randomBytes(32).toString("base64url");
  return { key, hash: hashDeliveryAccessKey(key) };
}

export function hashDeliveryAccessKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function verifyDeliveryAccessKey(key: string, storedHash: string | undefined) {
  if (!storedHash || !/^[a-f\d]{64}$/i.test(storedHash) || key.length < 40 || key.length > 64) return false;
  const candidate = Buffer.from(hashDeliveryAccessKey(key), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
