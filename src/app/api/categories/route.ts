import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, slugify, translated } from "@/lib/http";

const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }),
  image: cloudinaryUrl().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_categories");
      if ("error" in access) return access.error;
    }
    const items = await Category.find(showAll ? {} : { active: true }).sort({ name: 1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const name = await translated(parsed.data.name);
    const item = await Category.create({ ...parsed.data, name, slug: `${slugify(name.en)}-${Date.now().toString(36)}` });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
