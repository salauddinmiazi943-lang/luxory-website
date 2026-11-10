import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, translated } from "@/lib/http";

const optionalObjectId = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return typeof value === "string" ? value.trim() : value;
}, z.union([z.null(), z.string().regex(/^[a-f\d]{24}$/i, "Invalid category id")]).optional());
const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }).optional(),
  image: cloudinaryUrl().optional().or(z.literal("")),
  parentCategory: optionalObjectId,
  isFeatured: z.boolean().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(-9999).max(9999).optional(),
});
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid category id" }, { status: 400 });
    await connectDb();
    if (parsed.data.parentCategory) {
      if (parsed.data.parentCategory === id) return Response.json({ error: "A category cannot be its own parent" }, { status: 400 });
      const parent = await Category.exists({ _id: parsed.data.parentCategory });
      if (!parent) return Response.json({ error: "Parent category not found" }, { status: 400 });
    }
    const changes = {
      ...parsed.data,
      ...(parsed.data.parentCategory === null ? { parentCategory: undefined } : {}),
      ...(parsed.data.name ? { name: await translated(parsed.data.name) } : {}),
    };
    const update = parsed.data.parentCategory === null ? { $set: { ...changes, parentCategory: undefined }, $unset: { parentCategory: 1 } } : changes;
    const item = await Category.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Category not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid category id" }, { status: 400 });
    await connectDb();
    if (await Product.exists({ category: id })) return Response.json({ error: "This category is used by products. Deactivate it instead." }, { status: 409 });
    if (await Category.exists({ parentCategory: id })) return Response.json({ error: "This category has sub-categories. Remove or reassign them before deleting." }, { status: 409 });
    const item = await Category.findByIdAndDelete(id);
    if (!item) return Response.json({ error: "Category not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
