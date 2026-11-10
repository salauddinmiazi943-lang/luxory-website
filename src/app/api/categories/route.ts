import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, slugify, translated } from "@/lib/http";

const optionalObjectId = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().regex(/^[a-f\d]{24}$/i, "Invalid category id").optional());
const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }),
  image: cloudinaryUrl().optional().or(z.literal("")),
  parentCategory: optionalObjectId,
  isFeatured: z.boolean().default(false),
  active: z.boolean().default(true),
  order: z.number().int().min(-9999).max(9999).default(0),
});

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_categories");
      if ("error" in access) return access.error;
      const items = await Category.find({}).sort({ order: 1, name: 1 }).lean();
      return Response.json({ items });
    }
    let items = await Category.find({ active: true, isFeatured: true }).sort({ order: 1, name: 1 }).lean();
    if (items.length === 0) {
      items = await Category.find({ active: true }).sort({ order: 1, name: 1 }).limit(8).lean();
    }
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
    if (parsed.data.parentCategory) {
      const parent = await Category.exists({ _id: parsed.data.parentCategory });
      if (!parent) return Response.json({ error: "Parent category not found" }, { status: 400 });
    }
    const name = await translated(parsed.data.name);
    const item = await Category.create({ ...parsed.data, name, slug: `${slugify(name.en)}-${Date.now().toString(36)}` });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
