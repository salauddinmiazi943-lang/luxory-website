import { z } from "zod";

const rateBuckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, value] of rateBuckets) if (value.reset <= now) rateBuckets.delete(bucketKey);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset <= now) {
    rateBuckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${forwarded}`;
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: Response.json({ error: "Request body must be valid JSON" }, { status: 400 }) } as const;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 }) } as const;
  return { data: parsed.data } as const;
}

export const safeLink = () => z.string().trim().max(500).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Link must be a relative path or an HTTPS URL");

export function slugify(input: string) {
  return input.normalize("NFKD").toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 100);
}

export function cloudinaryUrl() {
  return z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return false;
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      return !cloudName || url.pathname.split("/")[1] === cloudName;
    } catch {
      return false;
    }
  }, "Must be a secure Cloudinary URL");
}

export async function translated(input: { en: string; bn?: string }) {
  if (input.bn?.trim()) return { en: input.en.trim(), bn: input.bn.trim() };
  const endpoint = process.env.TRANSLATE_API_URL;
  if (!endpoint) return { en: input.en.trim(), bn: input.en.trim() };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: input.en, source: "en", target: "bn", format: "text" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn("Translation service returned an unsuccessful response.", response.status);
      return { en: input.en.trim(), bn: input.en.trim() };
    }
    const result: unknown = await response.json();
    const candidate = typeof result === "object" && result !== null && "translatedText" in result ? result.translatedText : null;
    if (typeof candidate !== "string" || !candidate.trim()) console.warn("Translation service returned no translated text.");
    return { en: input.en.trim(), bn: typeof candidate === "string" && candidate.trim() ? candidate.trim() : input.en.trim() };
  } catch (error) {
    console.warn("Translation service failed; using English fallback.", error);
    return { en: input.en.trim(), bn: input.en.trim() };
  }
}

export function apiError(error: unknown) {
  if (error instanceof Error && error.message === "MONGODB_URI or both MONGO_USER and MONGO_PASS must be configured") {
    return Response.json({ error: "Database is not configured" }, { status: 503 });
  }
  if (error instanceof Error && (("code" in error && error.code === "ECONNREFUSED") || error.message.includes("querySrv ECONNREFUSED"))) {
    console.error("MongoDB connection failed; check DNS, network access, and Atlas availability.");
    return Response.json({ error: "Database is temporarily unavailable" }, { status: 503 });
  }
  if (error instanceof Error && (("code" in error && error.code === 18) || error.message.includes("bad auth"))) {
    console.error("MongoDB authentication failed; check the configured database credentials.");
    return Response.json({ error: "Database credentials are invalid" }, { status: 503 });
  }
  console.error(error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
