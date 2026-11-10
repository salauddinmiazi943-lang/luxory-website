import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Offer } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const schema = z.object({
  title: localized,
  subtitle: localized,
  image: cloudinaryUrl(),
  link: safeLink().default("/products"),
  active: z.boolean().default(true),
  order: z.number().int().default(0),
  startDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
});

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_offers");
      if ("error" in access) return access.error;
    }
    const now = new Date();
    const items = await Offer.find({
      active: true,
      ...(showAll ? {} : {
        $and: [
          { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
        ],
      }),
    }).sort({ order: 1, createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_offers");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const item = await Offer.create({
      ...parsed.data,
      title: await translated(parsed.data.title),
      subtitle: await translated(parsed.data.subtitle),
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
