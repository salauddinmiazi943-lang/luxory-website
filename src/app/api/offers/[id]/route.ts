import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Offer } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const schema = z.object({
  title: localized.optional(),
  subtitle: localized.optional(),
  image: cloudinaryUrl().optional(),
  link: safeLink().optional(),
  active: z.boolean().optional(),
  order: z.number().int().optional(),
  startDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
});
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_offers");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid offer id" }, { status: 400 });
    await connectDb();
    const changes: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.title) changes.title = await translated(parsed.data.title);
    if (parsed.data.subtitle) changes.subtitle = await translated(parsed.data.subtitle);
    const item = await Offer.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Offer not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requirePermission("manage_offers");
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid offer id" }, { status: 400 });
    await connectDb();
    const item = await Offer.findByIdAndDelete(id);
    if (!item) return Response.json({ error: "Offer not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
