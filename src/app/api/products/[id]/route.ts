import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import { getSession, hasPermission, requireUser } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, translated } from "@/lib/http";
import mongoose from "mongoose";
import { isValidQuantity, productUnits } from "@/lib/product-units";

const localeText = z.object({ en: z.string().trim().min(1).max(5000), bn: z.string().trim().max(5000).optional() });
const productVariant = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  label: z.string().trim().min(1).max(60),
  price: z.number().min(0),
  originalPrice: z.number().min(0).optional(),
  stock: z.number().min(0).max(100_000),
}).superRefine((v, ctx) => {
  if (v.originalPrice !== undefined && v.originalPrice > 0 && v.originalPrice <= v.price) {
    ctx.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price must be greater than current price" });
  }
});
const productInput = z.object({
  title: localeText.optional(), description: localeText.optional(), price: z.number().min(0).optional(),
  discountPrice: z.number().min(0).nullable().optional(), stock: z.number().min(0).max(100_000).optional(),
  unit: z.enum(productUnits).optional(), variants: z.array(productVariant).max(30).optional(),
  category: z.string().regex(/^[a-f\d]{24}$/i).optional(), images: z.array(cloudinaryUrl()).max(12).optional(),
  vendor: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  active: z.boolean().optional(), approved: z.boolean().optional(), featured: z.boolean().optional(), bestSeller: z.boolean().optional(),
});
type Context = { params: Promise<{ id: string }> };
type ProductVariantRecord = { label: string; price: number; originalPrice?: number; stock: number; _id?: mongoose.Types.ObjectId };

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
    const item = await Product.findOne(mongoose.isValidObjectId(id) ? { _id: id } : { slug: id }).populate("category", "name slug").lean();
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
    const item = await Product.findById(id);
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
    if (parsed.data.category && !(await Category.exists({ _id: parsed.data.category, active: true }))) {
      return Response.json({ error: "Category not found or inactive" }, { status: 400 });
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
          return { ...variant, ...(variant.originalPrice && variant.originalPrice > variant.price ? { originalPrice: variant.originalPrice } : {}), ...(currentId ? { _id: currentId } : {}) };
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
      if (process.env.VENDOR_PRODUCTS_REQUIRE_APPROVAL !== "false") {
        changes.active = false;
        changes.approved = false;
      } else {
        changes.approved = true;
      }
    }
    Object.assign(item, changes);
    await item.save();
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
    const item = await Product.findById(id);
    if (!item) return Response.json({ error: "Product not found" }, { status: 404 });
    const admin = access.user.role !== "vendor" && hasPermission(access.user, "manage_products");
    if (!admin && !(access.user.role === "vendor" && String(item.vendor) === access.user.id)) return Response.json({ error: "Forbidden" }, { status: 403 });
    await item.deleteOne();
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
