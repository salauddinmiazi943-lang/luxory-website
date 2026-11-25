import { z } from "zod";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { AuditLog, Category, Product } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, translated } from "@/lib/http";
import { VARIANT_TEMPLATE_KEYS } from "@/lib/variant-templates";

const optionalObjectId = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return typeof value === "string" ? value.trim() : value;
}, z.union([z.null(), z.string().regex(/^[a-f\d]{24}$/i, "Invalid category id")]).optional());
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
  name: z.object({ en: z.string().trim().min(1).max(200), bn: z.string().trim().max(200).optional() }).optional(),
  image: cloudinaryUrl().optional().or(z.literal("")),
  parentCategory: optionalObjectId,
  variantTemplate: z.enum(VARIANT_TEMPLATE_KEYS).or(z.literal("")).optional(),
  isFeatured: z.boolean().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(-9999).max(9999).optional(),
  archived: z.boolean().optional(),
  archiveReason: z.string().trim().max(500).optional(),
  attributeDefinitions: z.array(attributeDefinitionSchema).max(50).optional(),
});
type Context = { params: Promise<{ id: string }> };

const deleteSchema = z.object({
  action: z.enum(["archive", "reassign", "delete"]),
  reassignTo: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  reassignSubcategoriesTo: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.action === "reassign" && !value.reassignTo) {
    context.addIssue({ code: "custom", path: ["reassignTo"], message: "Choose a category to receive the products" });
  }
});

async function isDescendant(parentId: string, candidateId: string) {
  let currentId: string | null = candidateId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    if (currentId === parentId) return true;
    const category: { parentCategory?: unknown } | null = await Category.findById(currentId).select("parentCategory").lean();
    currentId = category?.parentCategory ? String(category.parentCategory) : null;
  }
  return false;
}

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
      if (await isDescendant(id, parsed.data.parentCategory)) {
        return Response.json({ error: "A category cannot be moved below itself or one of its descendants" }, { status: 400 });
      }
      const parent = await Category.findById(parsed.data.parentCategory).select("_id active archived").lean();
      if (!parent) return Response.json({ error: "Parent category not found" }, { status: 400 });
      if (parent.archived === true || parent.active === false) {
        return Response.json({ error: "An archived or inactive category cannot be used as a parent" }, { status: 400 });
      }
    }
    if (parsed.data.archived === false) {
      parsed.data.active = parsed.data.active ?? true;
    }
    if (parsed.data.archived === true) {
      parsed.data.active = false;
    }
    let attributeDefinitions: typeof parsed.data.attributeDefinitions = undefined;
    if (parsed.data.attributeDefinitions) {
      attributeDefinitions = await Promise.all(parsed.data.attributeDefinitions.map(async (attribute) => ({
        ...attribute,
        name: await translated(attribute.name),
        options: await Promise.all(attribute.options.map(async (option) => ({ ...option, name: await translated(option.name) }))),
      })));
      const keys = attributeDefinitions.map((attribute) => attribute.key);
      if (new Set(keys).size !== keys.length) {
        return Response.json({ error: "Attribute keys must be unique within a category" }, { status: 400 });
      }
    }
    const changes = {
      ...parsed.data,
      ...(parsed.data.parentCategory === null ? { parentCategory: undefined } : {}),
      ...(parsed.data.name ? { name: await translated(parsed.data.name) } : {}),
      ...(attributeDefinitions ? { attributeDefinitions } : {}),
      ...(parsed.data.archived === true
        ? { archivedAt: new Date(), archivedBy: new mongoose.Types.ObjectId(access.user.id), archiveReason: parsed.data.archiveReason ?? "" }
        : {}),
    };
    const unset: Record<string, number> = {};
    if (parsed.data.parentCategory === null) unset.parentCategory = 1;
    if (parsed.data.archived === false) {
      unset.archivedAt = 1;
      unset.archivedBy = 1;
      unset.archiveReason = 1;
    }
    const update = Object.keys(unset).length
      ? { $set: changes, $unset: unset }
      : changes;
    const item = await Category.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!item) return Response.json({ error: "Category not found" }, { status: 404 });
    await AuditLog.create({
      entityType: "category",
      entityId: String(item._id),
      action: parsed.data.archived === true ? "archive" : parsed.data.archived === false ? "restore" : "update",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: item.toObject(),
      details: parsed.data.archiveReason ?? "",
    });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const access = await requirePermission("manage_categories");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, deleteSchema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid category id" }, { status: 400 });
    await connectDb();
    const item = await Category.findById(id);
    if (!item) return Response.json({ error: "Category not found" }, { status: 404 });

    const productCount = await Product.countDocuments({ category: id });
    const subcategoryCount = await Category.countDocuments({ parentCategory: id });

    if (parsed.data.action === "archive") {
      item.archived = true;
      item.active = false;
      item.archivedAt = new Date();
      item.archivedBy = new mongoose.Types.ObjectId(access.user.id);
      item.archiveReason = parsed.data.reason ?? "";
      await item.save();
      await AuditLog.create({
        entityType: "category",
        entityId: String(item._id),
        action: "archive",
        actorId: access.user.id,
        actorName: access.user.name,
        actorRole: access.user.role,
        snapshot: item.toObject(),
        details: parsed.data.reason ?? "",
      });
      return Response.json({ success: true, archived: true, productCount, subcategoryCount });
    }

    if (parsed.data.action === "reassign") {
      if (!parsed.data.reassignTo) {
        return Response.json({ error: "Choose a category to receive the products" }, { status: 400 });
      }
      if (parsed.data.reassignTo === id) {
        return Response.json({ error: "Cannot reassign products to the category being deleted" }, { status: 400 });
      }
      if (await isDescendant(id, parsed.data.reassignTo)) {
        return Response.json({ error: "The reassignment category cannot be this category or one of its descendants" }, { status: 400 });
      }
      const target = await Category.findById(parsed.data.reassignTo).select("_id active archived").lean();
      if (!target) return Response.json({ error: "Reassignment category not found" }, { status: 400 });
      if (target.active === false || target.archived === true) {
        return Response.json({ error: "Reassignment category must be active" }, { status: 400 });
      }

      await Product.updateMany({ category: id }, { $set: { category: target._id } });

      if (parsed.data.reassignSubcategoriesTo) {
        if (parsed.data.reassignSubcategoriesTo === id) {
          return Response.json({ error: "Cannot reassign sub-categories to the category being deleted" }, { status: 400 });
        }
        if (await isDescendant(id, parsed.data.reassignSubcategoriesTo)) {
          return Response.json({ error: "Sub-category reassignment cannot create a hierarchy cycle" }, { status: 400 });
        }
        const subTarget = await Category.findById(parsed.data.reassignSubcategoriesTo).select("_id active archived").lean();
        if (!subTarget || subTarget.active === false || subTarget.archived === true) {
          return Response.json({ error: "Sub-category reassignment target must exist and be active" }, { status: 400 });
        }
        await Category.updateMany({ parentCategory: id }, { $set: { parentCategory: subTarget._id } });
      } else {
        await Category.updateMany({ parentCategory: id }, { $unset: { parentCategory: 1 } });
      }
    }

    const remainingProductCount = await Product.countDocuments({ category: id });
    const remainingSubcategoryCount = await Category.countDocuments({ parentCategory: id });
    if (parsed.data.action === "delete" && (remainingProductCount > 0 || remainingSubcategoryCount > 0)) {
      return Response.json({
        error: "This category is still used by products or sub-categories.",
        productCount: remainingProductCount,
        subcategoryCount: remainingSubcategoryCount,
      }, { status: 409 });
    }

    if (parsed.data.action === "reassign") {
      const deleted = await Category.findByIdAndDelete(id);
      if (!deleted) return Response.json({ error: "Category not found" }, { status: 404 });
      await AuditLog.create({
        entityType: "category",
        entityId: id,
        action: "reassign_and_delete",
        actorId: access.user.id,
        actorName: access.user.name,
        actorRole: access.user.role,
        snapshot: { deleted: deleted.toObject(), reassignTo: parsed.data.reassignTo, reassignSubcategoriesTo: parsed.data.reassignSubcategoriesTo ?? null },
      });
      return Response.json({ success: true, reassignedProducts: productCount, reassignedSubcategories: subcategoryCount });
    }

    const deleted = await Category.findByIdAndDelete(id);
    if (deleted) await AuditLog.create({
      entityType: "category",
      entityId: id,
      action: "delete",
      actorId: access.user.id,
      actorName: access.user.name,
      actorRole: access.user.role,
      snapshot: deleted.toObject(),
    });
    return Response.json({ success: true, deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
