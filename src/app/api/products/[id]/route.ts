import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import { getSession, hasPermission, requireUser } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, translated } from "@/lib/http";
import mongoose from "mongoose";
import { isValidQuantity, productUnits } from "@/lib/product-units";
import { recordStockMovements } from "@/lib/stock-movements";

const localeText = z.object({ en: z.string().trim().min(1).max(5000), bn: z.string().trim().max(5000).optional() });
const attributeValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const productVariant = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  label: z.string().trim().min(1).max(60),
  colorHex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  price: z.number().min(0),
  originalPrice: z.number().min(0).optional(),
  stock: z.number().min(0).max(100_000),
  sku: z.string().trim().max(80).optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder"]).default("in_stock"),
  images: z.array(cloudinaryUrl()).max(12).default([]),
  attributeValues: z.record(z.string(), attributeValue).optional().default({}),
}).superRefine((v, ctx) => {
  if (v.originalPrice !== undefined && v.originalPrice > 0 && v.originalPrice <= v.price) {
    ctx.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price must be greater than current price" });
  }
});
const productInput = z.object({
  title: localeText.optional(), description: localeText.optional(), productDetails: z.string().trim().max(3000).optional(), price: z.number().min(0).optional(),
  discountPrice: z.number().min(0).nullable().optional(), resellerPrice: z.number().min(0).nullable().optional(), wholesalerPrice: z.number().min(0).nullable().optional(),
  resellerMoq: z.number().min(0.01).max(100_000).nullable().optional(), wholesalerMoq: z.number().min(0.01).max(100_000).nullable().optional(),
  stock: z.number().min(0).max(100_000).optional(),
  unit: z.enum(productUnits).optional(), variants: z.array(productVariant).max(30).optional(),
  category: z.string().regex(/^[a-f\d]{24}$/i).optional(), images: z.array(cloudinaryUrl()).max(12).optional(),
  attributeValues: z.record(z.string(), attributeValue).optional(),
  vendor: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  active: z.boolean().optional(), approved: z.boolean().optional(), featured: z.boolean().optional(), bestSeller: z.boolean().optional(),
});
type Context = { params: Promise<{ id: string }> };
type ProductVariantRecord = { label: string; price: number; originalPrice?: number; stock: number; _id?: mongoose.Types.ObjectId };
type AttributeDefinition = {
  key: string;
  name: { en: string; bn?: string };
  type: "text" | "number" | "select" | "multiselect" | "boolean" | "colour";
  options?: { value: string }[];
  required?: boolean;
  active?: boolean;
};

function attributeValidationError(definitions: AttributeDefinition[], values: Record<string, string | number | boolean | string[]>) {
  const allowedKeys = new Set(definitions.filter((definition) => definition.active !== false).map((definition) => definition.key));
  for (const key of Object.keys(values)) {
    if (!allowedKeys.has(key)) return `Unknown or inactive attribute: ${key}`;
  }
  for (const definition of definitions) {
    if (definition.active === false) continue;
    const value = values[definition.key];
    const missing = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (definition.required && missing) return `${definition.name.en} is required`;
    if (missing) continue;
    if (definition.type === "number" && typeof value !== "number") return `${definition.name.en} must be a number`;
    if (definition.type === "boolean" && typeof value !== "boolean") return `${definition.name.en} must be true or false`;
    if ((definition.type === "text" || definition.type === "colour") && typeof value !== "string") return `${definition.name.en} must be text`;
    if (definition.type === "select" && typeof value !== "string") return `${definition.name.en} must be a single option`;
    if (definition.type === "multiselect" && !Array.isArray(value)) return `${definition.name.en} must contain one or more options`;
    if (definition.type === "select" || definition.type === "multiselect" || definition.type === "colour") {
      const allowed = new Set((definition.options ?? []).map((option) => option.value));
      const selected = Array.isArray(value) ? value : [value];
      if (selected.some((option) => typeof option !== "string" || !allowed.has(option))) return `${definition.name.en} contains an invalid option`;
    }
  }
  return null;
}

export async function GET(_request: Request, { params }: Context) {
  try {
    await connectDb();
    const { id } = await params;
    const tokenSession = await getSession();
    let session = tokenSession;
    if (tokenSession) {
      const access = await requireUser();
      if ("error" in access) return access.error;
      session = access.user;
    }
    const item = await Product.findOne({
      ...(mongoose.isValidObjectId(id) ? { _id: id } : { slug: id }),
      deletedAt: { $exists: false },
    }).populate("category", "name slug attributeDefinitions").lean();
    if (!item) return Response.json({ error: "Product not found" }, { status: 404 });
    const owner = session?.role === "vendor" && String(item.vendor) === session.id;
    const admin = session && (session.role === "super_admin" || (session.role === "admin" && hasPermission(session, "manage_products")));
    if ((!item.active || !item.approved) && !owner && !admin) return Response.json({ error: "Product not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const access = await requireUser(["super_admin", "admin", "vendor"]);
    if ("error" in access) return access.error;
    const parsed = await readJson(request, productInput);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid product id" }, { status: 400 });
    const item = await Product.findOne({ _id: id, deletedAt: { $exists: false } });
    if (!item) return Response.json({ error: "Product not found" }, { status: 404 });
    const admin = access.user.role !== "vendor" && hasPermission(access.user, "manage_products");
    const featureManager = access.user.role !== "vendor" && hasPermission(access.user, "manage_featured")
      && Object.keys(parsed.data).length === 1 && Object.hasOwn(parsed.data, "featured");
    const vendorOwner = access.user.role === "vendor" && String(item.vendor) === access.user.id;
    if (!admin && !vendorOwner && !featureManager) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (featureManager && Object.keys(parsed.data).some((key) => key !== "featured")) return Response.json({ error: "Forbidden" }, { status: 403 });
    const currentVariants = (item.variants ?? []) as ProductVariantRecord[];
    const nextVariants: ProductVariantRecord[] = parsed.data.variants ?? currentVariants;
    const nextUnit = parsed.data.unit ?? item.unit ?? "piece";
    const nextPrice = nextVariants.length ? Math.min(...nextVariants.map((variant) => variant.price)) : parsed.data.price ?? item.price;
    const nextStock = nextVariants.length ? nextVariants.reduce((total, variant) => total + variant.stock, 0) : parsed.data.stock ?? item.stock;
    if (nextVariants.length && ((parsed.data.price !== undefined && parsed.data.price !== nextPrice) || (parsed.data.stock !== undefined && parsed.data.stock !== nextStock))) {
      return Response.json({ error: "Update variant prices and stock through the product options" }, { status: 400 });
    }
    const nextDiscount = parsed.data.discountPrice === undefined ? item.discountPrice : parsed.data.discountPrice;
    if (nextDiscount != null && nextDiscount > nextPrice) return Response.json({ error: "Discount price cannot exceed regular price" }, { status: 400 });
    if (nextVariants.length > 0) {
      const labels = nextVariants.map((variant) => variant.label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) return Response.json({ error: "Variant labels must be unique" }, { status: 400 });
      if (parsed.data.variants?.some((variant) => variant.id && !currentVariants.some((current) => String(current._id) === variant.id))) {
        return Response.json({ error: "A product option does not belong to this product" }, { status: 400 });
      }
      if (nextVariants.some((variant) => variant.stock !== 0 && !isValidQuantity(nextUnit, variant.stock))) {
        return Response.json({ error: "Variant stock must match the selected unit's quantity step" }, { status: 400 });
      }
    } else if (nextStock !== 0 && !isValidQuantity(nextUnit, nextStock)) {
      return Response.json({ error: "Stock must match the selected unit's quantity step" }, { status: 400 });
    }
    if (parsed.data.category && !(await Category.exists({ _id: parsed.data.category, active: true, archived: { $ne: true } }))) {
      return Response.json({ error: "Category not found or inactive" }, { status: 400 });
    }
    if (parsed.data.attributeValues) {
      const categoryId = parsed.data.category ?? String(item.category);
      const category = await Category.findOne({ _id: categoryId, active: true, archived: { $ne: true } })
        .select("attributeDefinitions")
        .lean();
      if (!category) return Response.json({ error: "Category not found or inactive" }, { status: 400 });
      const attributeError = attributeValidationError(
        (category.attributeDefinitions ?? []) as AttributeDefinition[],
        parsed.data.attributeValues,
      );
      if (attributeError) return Response.json({ error: attributeError }, { status: 400 });
    }
    let vendorRequiresApproval = false;
    if (vendorOwner) {
      const vendor = await User.findOne({ _id: access.user.id, role: "vendor", status: "active" })
        .select("vendorProductPermissions")
        .lean();
      const permissions = vendor?.vendorProductPermissions;
      vendorRequiresApproval = permissions?.requireApproval !== false;
      if (parsed.data.category && parsed.data.category.toLowerCase() !== String(item.category).toLowerCase()) {
        const categoryId = parsed.data.category.toLowerCase();
        const allowed = (permissions?.allowedCategoryIds ?? []).some((id) => String(id).toLowerCase() === categoryId);
        const denied = (permissions?.deniedCategoryIds ?? []).some((id) => String(id).toLowerCase() === categoryId);
        if (!permissions?.productAddEnabled || !allowed || denied) {
          return Response.json({ error: "You are not allowed to move this product to that category" }, { status: 403 });
        }
      }
    }
    if (parsed.data.vendor && !(await User.exists({ _id: parsed.data.vendor, role: "vendor", status: "active" }))) {
      return Response.json({ error: "Vendor not found or inactive" }, { status: 400 });
    }
    const changes: Record<string, unknown> = { ...parsed.data };
    if (nextVariants.length) {
      if (parsed.data.variants) {
        const currentVariantIds = new Map(currentVariants.map((variant) => [variant.label.trim().toLowerCase(), variant._id]));
        changes.variants = parsed.data.variants.map(({ id, ...variant }) => {
          const currentId = id ?? currentVariantIds.get(variant.label.trim().toLowerCase());
            return {
              ...variant,
              ...(variant.sku?.trim() ? { sku: variant.sku.trim().toUpperCase() } : {}),
              availability: variant.stock > 0 && variant.availability === "out_of_stock" ? "out_of_stock" : variant.stock > 0 ? variant.availability : "out_of_stock",
              ...(variant.originalPrice && variant.originalPrice > variant.price ? { originalPrice: variant.originalPrice } : {}),
              ...(currentId ? { _id: currentId } : {}),
            };
        });
      }
      changes.price = nextPrice;
      changes.stock = nextStock;
    }
    if (parsed.data.title) changes.title = await translated(parsed.data.title);
    if (parsed.data.description) changes.description = await translated(parsed.data.description);
    if (vendorOwner) {
      delete changes.vendor;
      delete changes.approved;
      delete changes.featured;
      if (vendorRequiresApproval) {
        changes.active = false;
        changes.approved = false;
      } else {
        changes.approved = true;
      }
    }
    const previousStock = item.stock;
    Object.assign(item, changes);
    await item.save();
    if (typeof changes.stock === "number" && changes.stock !== previousStock) {
      await recordStockMovements([{
        productId: item._id,
        productTitle: item.title?.en ?? "",
        delta: changes.stock - previousStock,
        stockBefore: previousStock,
        stockAfter: changes.stock,
        reason: "product_updated",
        actorId: access.user.id,
        actorRole: access.user.role,
        note: "স্টক আপডেট",
      }]);
    }
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const access = await requireUser(["super_admin", "admin", "vendor"]);
    if ("error" in access) return access.error;
    await connectDb();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid product id" }, { status: 400 });
    const item = await Product.findOne({ _id: id, deletedAt: { $exists: false } });
    if (!item) return Response.json({ error: "Product not found" }, { status: 404 });
    const admin = access.user.role !== "vendor" && hasPermission(access.user, "manage_products");
    if (!admin && !(access.user.role === "vendor" && String(item.vendor) === access.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
    item.deletedAt = new Date();
    item.deletedBy = new mongoose.Types.ObjectId(access.user.id);
    item.deletedByName = access.user.name;
    item.deletedByRole = access.user.role;
    item.deletedActive = item.active;
    item.active = false;
    await item.save();
    return Response.json({ success: true, deletedAt: item.deletedAt });
  } catch (error) {
    return apiError(error);
  }
}
