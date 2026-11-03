import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Banner } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const schema = z.object({ image: cloudinaryUrl().optional(), title: localized.optional(), subtitle: localized.optional(), link: safeLink().optional(), order: z.number().int().optional(), active: z.boolean().optional() });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_banners");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid banner id" }, { status: 400 });
    await connectDb();
    const changes = {
      ...parsed.data,
      ...(parsed.data.title ? { title: await translated(parsed.data.title) } : {}),
      ...(parsed.data.subtitle ? { subtitle: await translated(parsed.data.subtitle) } : {}),
    };
    const item = await Banner.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Banner not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requirePermission("manage_banners");
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid banner id" }, { status: 400 });
    await connectDb();
    const item = await Banner.findByIdAndDelete(id);
    if (!item) return Response.json({ error: "Banner not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
