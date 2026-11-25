import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { AuditLog, Colour } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson, translated } from "@/lib/http";

const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(120), bn: z.string().trim().max(120).optional() }).optional(),
  hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "HEX must use #RRGGBB").optional(),
  active: z.boolean().optional(),
  archived: z.boolean().optional(),
  order: z.number().int().min(-9999).max(9999).optional(),
});

function rgbFromHex(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid colour id" }, { status: 400 });
    await connectDb();
    const changes: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.name) changes.name = await translated(parsed.data.name);
    if (parsed.data.hex) {
      const hex = parsed.data.hex.toUpperCase();
      changes.hex = hex;
      changes.rgb = rgbFromHex(hex);
    }
    if (parsed.data.archived === true) {
      changes.active = false;
      changes.archivedAt = new Date();
      changes.archivedBy = new mongoose.Types.ObjectId(access.user.id);
    }
    const unset: Record<string, number> = {};
    if (parsed.data.archived === false) {
      changes.active = true;
      unset.archivedAt = 1;
      unset.archivedBy = 1;
    }
    const update = Object.keys(unset).length ? { $set: changes, $unset: unset } : changes;
    const item = await Colour.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Colour not found" }, { status: 404 });
    await AuditLog.create({
      entityType: "colour",
      entityId: String(item._id),
      action: "archive",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: item.toObject(),
    });
    await AuditLog.create({
      entityType: "colour",
      entityId: String(item._id),
      action: parsed.data.archived === true ? "archive" : parsed.data.archived === false ? "restore" : "update",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: item.toObject(),
    });
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
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid colour id" }, { status: 400 });
    await connectDb();
    const item = await Colour.findByIdAndUpdate(id, {
      $set: {
        active: false,
        archived: true,
        archivedAt: new Date(),
        archivedBy: new mongoose.Types.ObjectId(access.user.id),
      },
    }, { new: true });
    if (!item) return Response.json({ error: "Colour not found" }, { status: 404 });
    return Response.json({ success: true, archived: true });
  } catch (error) {
    return apiError(error);
  }
}
