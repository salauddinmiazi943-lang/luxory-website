import { z } from "zod";
import { connectDb } from "@/lib/db";
import { AuditLog, Category } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, slugify, translated } from "@/lib/http";
import { VARIANT_TEMPLATE_KEYS } from "@/lib/variant-templates";

const optionalObjectId = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().regex(/^[a-f\d]{24}$/i, "Invalid category id").optional());
const attributeOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }),
  hex: z.string().trim().max(20).optional(),
});
const attributeDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/, "Attribute key may contain only lowercase letters, numbers, hyphens and underscores"),
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }),
  type: z.enum(["text", "number", "select", "multiselect", "boolean", "colour"]),
  options: z.array(attributeOptionSchema).max(200).default([]),
  required: z.boolean().default(false),
  displayOrder: z.number().int().min(-9999).max(9999).default(0),
  active: z.boolean().default(true),
});
const schema = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }),
  image: cloudinaryUrl().optional().or(z.literal("")),
  parentCategory: optionalObjectId,
  variantTemplate: z.enum(VARIANT_TEMPLATE_KEYS).or(z.literal("")).default(""),
  isFeatured: z.boolean().default(false),
  active: z.boolean().default(true),
  order: z.number().int().min(-9999).max(9999).default(0),
  archived: z.literal(false).optional().default(false),
  attributeDefinitions: z.array(attributeDefinitionSchema).max(50).optional(),
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
    if (new URL(request.url).searchParams.get("publicAll") === "true") {
      const items = await Category.find({ active: true, archived: { $ne: true } }).sort({ order: 1, name: 1 }).lean();
      return Response.json({ items });
    }
    let items = await Category.find({ active: true, archived: { $ne: true }, isFeatured: true }).sort({ order: 1, name: 1 }).lean();
    if (items.length === 0) {
      items = await Category.find({ active: true, archived: { $ne: true } }).sort({ order: 1, name: 1 }).limit(8).lean();
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
      const parent = await Category.findById(parsed.data.parentCategory).select("_id active archived").lean();
      if (!parent) return Response.json({ error: "Parent category not found" }, { status: 400 });
      if (parent.archived === true || parent.active === false) {
        return Response.json({ error: "An archived or inactive category cannot be used as a parent" }, { status: 400 });
      }
    }
    const name = await translated(parsed.data.name);
    const attributeDefinitions = parsed.data.attributeDefinitions ? await Promise.all(parsed.data.attributeDefinitions.map(async (attribute) => ({
      ...attribute,
      name: await translated(attribute.name),
      options: await Promise.all(attribute.options.map(async (option) => ({ ...option, name: await translated(option.name) }))),
    }))) : [];
    const keys = attributeDefinitions.map((attribute) => attribute.key);
    if (new Set(keys).size !== keys.length) {
      return Response.json({ error: "Attribute keys must be unique within a category" }, { status: 400 });
    }
    const item = await Category.create({ ...parsed.data, name, attributeDefinitions, slug: `${slugify(name.en)}-${Date.now().toString(36)}` });
    await AuditLog.create({
      entityType: "category",
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
