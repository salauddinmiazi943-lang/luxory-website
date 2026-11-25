import { z } from "zod";
import { connectDb } from "@/lib/db";
import { AuditLog, Colour } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson, translated } from "@/lib/http";

const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(120), bn: z.string().trim().max(120).optional() }),
  hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "HEX must use #RRGGBB"),
  active: z.boolean().default(true),
  order: z.number().int().min(-9999).max(9999).default(0),
});

function rgbFromHex(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_categories");
      if ("error" in access) return access.error;
      const items = await Colour.find({}).sort({ order: 1, name: 1 }).lean();
      return Response.json({ items });
    }
    const items = await Colour.find({ active: true, archived: { $ne: true } }).sort({ order: 1, name: 1 }).lean();
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
    const hex = parsed.data.hex.toUpperCase();
    const item = await Colour.create({ ...parsed.data, name, hex, rgb: rgbFromHex(hex) });
    await AuditLog.create({
      entityType: "colour",
      entityId: String(item._id),
      action: "create",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: item.toObject(),
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
