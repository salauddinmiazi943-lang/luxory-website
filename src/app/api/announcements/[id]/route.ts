import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Announcement } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const schema = z.object({
  title: localized.optional(),
  link: safeLink().optional(),
  active: z.boolean().optional(),
  order: z.number().int().optional(),
  startDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
});
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_announcements");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid announcement id" }, { status: 400 });
    await connectDb();
    const changes: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.title) changes.title = await translated(parsed.data.title);
    const item = await Announcement.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Announcement not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requirePermission("manage_announcements");
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid announcement id" }, { status: 400 });
    await connectDb();
    const item = await Announcement.findByIdAndDelete(id);
    if (!item) return Response.json({ error: "Announcement not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
