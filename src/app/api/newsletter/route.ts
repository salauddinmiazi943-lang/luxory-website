import { z } from "zod";
import { connectDb } from "@/lib/db";
import { NewsletterSubscriber } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address").max(254) });

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "newsletter"), 5, 10 * 60_000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const email = parsed.data.email.toLowerCase();
    const existing = await NewsletterSubscriber.findOne({ email }).select("_id active").lean();
    if (existing) {
      if (!existing.active) await NewsletterSubscriber.updateOne({ _id: existing._id }, { $set: { active: true } });
      return Response.json({ ok: true, alreadySubscribed: true, message: "This email is already subscribed." });
    }
    await NewsletterSubscriber.create({ email, source: "footer" });
    return Response.json({ ok: true, message: "You are subscribed. Thank you!" }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return Response.json({ ok: true, alreadySubscribed: true, message: "This email is already subscribed." });
    }
    return apiError(error);
  }
}

export async function GET() {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
    await connectDb();
    const items = await NewsletterSubscriber.find({ active: true }).sort({ createdAt: -1 }).limit(500).lean();
    return Response.json({ items, total: items.length });
  } catch (error) {
    return apiError(error);
  }
}
