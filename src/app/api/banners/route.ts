import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Banner } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const schema = z.object({ image: cloudinaryUrl(), title: localized, subtitle: localized, link: safeLink().default("/"), order: z.number().int().default(0), active: z.boolean().default(true) });

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_banners");
      if ("error" in access) return access.error;
    }
    const items = await Banner.find(showAll ? {} : { active: true }).sort({ order: 1, createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_banners");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const item = await Banner.create({ ...parsed.data, title: await translated(parsed.data.title), subtitle: await translated(parsed.data.subtitle) });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
