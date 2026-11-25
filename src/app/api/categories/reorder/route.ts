import { z } from "zod";
import { connectDb } from "@/lib/db";
import { AuditLog, Category } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  items: z.array(z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i),
    order: z.number().int().min(-9999).max(9999),
  })).min(1).max(500),
});

export async function POST(request: Request) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const ids = parsed.data.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      return Response.json({ error: "Category IDs must be unique" }, { status: 400 });
    }
    const existing = await Category.find({ _id: { $in: ids } }).select("_id").lean();
    if (existing.length !== ids.length) {
      return Response.json({ error: "One or more categories no longer exist" }, { status: 409 });
    }
    await Promise.all(parsed.data.items.map((item) =>
      Category.updateOne({ _id: item.id }, { $set: { order: item.order } }),
    ));
    await AuditLog.create({
      entityType: "category",
      entityId: "multiple",
      action: "reorder",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: { items: parsed.data.items },
    });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
