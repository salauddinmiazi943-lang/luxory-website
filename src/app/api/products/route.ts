import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import type { SortOrder } from "mongoose";
import { getSession, hasPermission, requireUser } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, slugify, translated } from "@/lib/http";
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
  title: localeText, description: localeText, productDetails: z.string().trim().max(3000).optional(), price: z.number().min(0), discountPrice: z.number().min(0).optional(),
  resellerPrice: z.number().min(0).optional(), wholesalerPrice: z.number().min(0).optional(),
  resellerMoq: z.number().min(0.01).max(100_000).optional(), wholesalerMoq: z.number().min(0.01).max(100_000).optional(),
  stock: z.number().min(0).max(100_000), unit: z.enum(productUnits).default("piece"),
  variants: z.array(productVariant).max(30).default([]),
  category: z.string().regex(/^[a-f\d]{24}$/i), images: z.array(cloudinaryUrl()).max(12).default([]),
  attributeValues: z.record(z.string(), attributeValue).optional().default({}),
  vendor: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  active: z.boolean().default(true), featured: z.boolean().default(false), bestSeller: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.discountPrice !== undefined && value.variants.length === 0 && value.discountPrice > value.price) {
    context.addIssue({ code: "custom", path: ["discountPrice"], message: "Discount price cannot exceed regular price" });
  }
  if (value.variants.length > 0) {
    if (value.discountPrice !== undefined) context.addIssue({ code: "custom", path: ["discountPrice"], message: "Set prices on each variant instead of a product discount" });
    const labels = value.variants.map((variant) => variant.label.toLowerCase());
    if (new Set(labels).size !== labels.length) context.addIssue({ code: "custom", path: ["variants"], message: "Variant labels must be unique" });
    const lowest = Math.min(...value.variants.map((variant) => variant.price));
    if (value.price !== lowest) {
      context.addIssue({ code: "custom", path: ["price"], message: "Product price must match its lowest current variant price" });
    }
    if (value.stock !== value.variants.reduce((total, variant) => total + variant.stock, 0)) {
      context.addIssue({ code: "custom", path: ["stock"], message: "Product stock must equal the total stock of its variants" });
    }
    if (value.variants.some((variant) => variant.stock !== 0 && !isValidQuantity(value.unit, variant.stock))) {
      context.addIssue({ code: "custom", path: ["variants"], message: "Variant stock must match the selected unit's quantity step" });
    }
  } else if (!isValidQuantity(value.unit, value.stock) && value.stock !== 0) {
    context.addIssue({ code: "custom", path: ["stock"], message: "Stock must match the selected unit's quantity step" });
  }
});

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

export async function GET(request: Request) {
  try {
    await connectDb();
    const url = new URL(request.url);
    const tokenSession = await getSession();
    let session = tokenSession;
    if (tokenSession) {
      const access = await requireUser();
      if ("error" in access) return access.error;
      session = access.user;
    }
    const privileged = session && (session.role === "super_admin" || (session.role === "admin" && hasPermission(session, "manage_products")));
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (privileged) {
      const owner = url.searchParams.get("vendor");
      if (owner) {
        if (!/^[a-f\d]{24}$/i.test(owner)) return Response.json({ error: "Invalid vendor id" }, { status: 400 });
        filter.vendor = owner;
      }
      if (url.searchParams.get("all") !== "true") filter.active = true;
    } else if (session?.role === "vendor") {
      filter.vendor = session.id;
    } else {
      filter.active = true;
      filter.approved = true;
    }
    const category = url.searchParams.get("category");
    if (category) {
      if (!/^[a-f\d]{24}$/i.test(category)) return Response.json({ error: "Invalid category" }, { status: 400 });
      filter.category = category;
    }
    if (url.searchParams.get("featured") === "true") filter.featured = true;
    if (url.searchParams.get("bestSeller") === "true") filter.bestSeller = true;
    const discountedParam = url.searchParams.get("discounted") === "true" || url.searchParams.get("offers") === "true";
    if (discountedParam) {
      // Valid discounts only: simple sale (discountPrice < price) OR any variant with originalPrice > current price.
      // Legacy-compatible and additive; does not modify data.
      filter.$or = [
        { $expr: { $and: [{ $gt: ["$discountPrice", 0] }, { $lt: ["$discountPrice", "$price"] }] } },
        { $expr: { $gt: [{ $size: { $filter: { input: { $ifNull: ["$variants", []] }, as: "v", cond: { $and: [{ $gt: ["$v.originalPrice", 0] }, { $lt: ["$v.price", "$v.originalPrice"] }] } } } }, 0] } },
      ];
    }
    const search = url.searchParams.get("q")?.trim().slice(0, 100);
    if (search && url.searchParams.get("suggestions") === "true") {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const titlePrefix = new RegExp(`^${escapedSearch}`, "i");
      const items = await Product.find({
        $and: [
          filter,
          { $or: [{ "title.en": titlePrefix }, { "title.bn": titlePrefix }] },
        ],
      })
        .select("slug title")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();
      return Response.json({ items });
    }
    if (search) filter.$text = { $search: search };
    const minParam = url.searchParams.get("min");
    const maxParam = url.searchParams.get("max");
    const min = minParam === null || minParam === "" ? undefined : Number(minParam);
    const max = maxParam === null || maxParam === "" ? undefined : Number(maxParam);
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (min !== undefined && max !== undefined && min > max)) {
      return Response.json({ error: "Invalid price range" }, { status: 400 });
    }
    if (Number.isFinite(min) || Number.isFinite(max)) filter.price = { ...(Number.isFinite(min) ? { $gte: min } : {}), ...(Number.isFinite(max) ? { $lte: max } : {}) };
    const availability = url.searchParams.get("availability");
    if (availability === "available") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and as Record<string, unknown>[] : []),
        { $or: [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }] },
      ];
    }
    if (url.searchParams.get("new") === "true") {
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }
    for (const [key, rawValue] of url.searchParams.entries()) {
      if (!key.startsWith("attribute_")) continue;
      const attributeKey = key.slice("attribute_".length).replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
      const values = rawValue.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 30);
      if (!attributeKey || !values.length) continue;
      filter[`attributeValues.${attributeKey}`] = values.length === 1 ? values[0] : { $in: values };
    }
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit")) || 12));
    const sort: Record<string, SortOrder> = url.searchParams.get("sort") === "price_asc" ? { price: 1 } : url.searchParams.get("sort") === "price_desc" ? { price: -1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      Product.find(filter).populate("category", "name slug").populate("vendor", "name email").sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return Response.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireUser(["super_admin", "admin", "vendor"]);
    if ("error" in result) return result.error;
    if (result.user.role !== "vendor" && !hasPermission(result.user, "manage_products")) return Response.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await readJson(request, productInput);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const category = await Category.findOne({ _id: parsed.data.category, active: true, archived: { $ne: true } })
      .select("attributeDefinitions")
      .lean();
    if (!category) return Response.json({ error: "Category not found or inactive" }, { status: 400 });
    const attributeError = attributeValidationError(
      (category.attributeDefinitions ?? []) as AttributeDefinition[],
      parsed.data.attributeValues,
    );
    if (attributeError) return Response.json({ error: attributeError }, { status: 400 });
    if (parsed.data.vendor && result.user.role !== "vendor" && !(await User.exists({ _id: parsed.data.vendor, role: "vendor", status: "active" }))) {
      return Response.json({ error: "Vendor not found or inactive" }, { status: 400 });
    }
    let vendorRequiresApproval = false;
    if (result.user.role === "vendor") {
      const vendor = await User.findOne({ _id: result.user.id, role: "vendor", status: "active" })
        .select("vendorProductPermissions")
        .lean();
      const permissions = vendor?.vendorProductPermissions;
      const categoryId = String(parsed.data.category).toLowerCase();
      const allowed = (permissions?.allowedCategoryIds ?? []).some((id) => String(id).toLowerCase() === categoryId);
      const denied = (permissions?.deniedCategoryIds ?? []).some((id) => String(id).toLowerCase() === categoryId);
      if (!permissions?.productAddEnabled || !allowed || denied) {
        return Response.json({ error: "You are not allowed to add products in this category" }, { status: 403 });
      }
      const maxProducts = permissions.maxProducts ?? 0;
      const productCount = await Product.countDocuments({ vendor: result.user.id });
      if (maxProducts < 1 || productCount >= maxProducts) {
        return Response.json({ error: "Your vendor product limit has been reached" }, { status: 409 });
      }
      vendorRequiresApproval = permissions.requireApproval !== false;
    }
    const title = await translated(parsed.data.title);
    const description = await translated(parsed.data.description);
    const slugBase = slugify(title.en) || `product-${Date.now()}`;
    const created = await Product.create({
      ...parsed.data, variants: parsed.data.variants.map((variant) => ({
        label: variant.label,
        ...(variant.colorHex ? { colorHex: variant.colorHex.toUpperCase() } : {}),
        price: variant.price,
        ...(variant.originalPrice && variant.originalPrice > variant.price ? { originalPrice: variant.originalPrice } : {}),
        stock: variant.stock,
        ...(variant.sku?.trim() ? { sku: variant.sku.trim().toUpperCase() } : {}),
        availability: variant.stock > 0 && variant.availability === "out_of_stock" ? "out_of_stock" : variant.stock > 0 ? variant.availability : "out_of_stock",
        images: variant.images,
        attributeValues: variant.attributeValues,
      })),
      title, description, slug: `${slugBase}-${Date.now().toString(36)}`,
      vendor: result.user.role === "vendor" ? result.user.id : parsed.data.vendor,
      createdBy: result.user.id,
      createdByName: result.user.name,
      createdByRole: result.user.role,
      approved: result.user.role !== "vendor" || !vendorRequiresApproval,
      active: result.user.role === "vendor" && vendorRequiresApproval ? false : parsed.data.active,
    });
    await recordStockMovements([{
      productId: created._id,
      productTitle: created.title?.en ?? "",
      delta: created.stock ?? 0,
      stockBefore: 0,
      stockAfter: created.stock ?? 0,
      reason: "product_created",
      actorId: result.user.id,
      actorRole: result.user.role,
      note: `নতুন পণ্য · ${created.stock ?? 0} ${created.unit ?? "piece"}`,
    }]);
    return Response.json({ item: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
