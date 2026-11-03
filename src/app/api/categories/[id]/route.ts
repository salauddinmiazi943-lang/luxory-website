import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, translated } from "@/lib/http";

const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }).optional(),
  image: cloudinaryUrl().optional().or(z.literal("")),
  active: z.boolean().optional(),
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
    const changes = { ...parsed.data, ...(parsed.data.name ? { name: await translated(parsed.data.name) } : {}) };
    const item = await Category.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
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
    const item = await Category.findByIdAndDelete(id);
    if (!item) return Response.json({ error: "Category not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
