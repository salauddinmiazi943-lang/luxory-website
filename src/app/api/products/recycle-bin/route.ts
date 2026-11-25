import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const restoreSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100),
}).superRefine(({ ids }, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["ids"], message: "Product IDs must be unique" });
  }
});

export async function GET(request: Request) {
  const access = await requirePermission("manage_products");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    if (!Number.isSafeInteger(page) || page < 1) return Response.json({ error: "Invalid page" }, { status: 400 });
    if (!Number.isSafeInteger(rawLimit) || rawLimit < 1) return Response.json({ error: "Invalid limit" }, { status: 400 });
    const limit = Math.min(100, rawLimit);
    const filter = { deletedAt: { $exists: true } };
    const total = await Product.countDocuments(filter);
    const pages = Math.ceil(total / limit);
    if (page > Math.max(1, pages)) return Response.json({ items: [], total, page: Math.max(1, pages), pages });
    const items = await Product.find(filter)
      .populate("category", "name slug")
      .populate("vendor", "name shopName")
      .populate("createdBy", "name")
      .populate("deletedBy", "name")
      .sort({ deletedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return Response.json({ items, total, page, pages });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_products");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, restoreSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();

    const products = await Product.find({
      _id: { $in: parsed.data.ids },
      deletedAt: { $exists: true },
    }).select("_id category vendor deletedAt deletedActive").lean();
    if (products.length !== parsed.data.ids.length) {
      return Response.json({ error: "One or more selected products are no longer in the recycle bin" }, { status: 404 });
    }

    const categoryIds = [...new Set(products.map((product) => String(product.category)))];
    if (categoryIds.some((id) => !mongoose.isValidObjectId(id))) {
      return Response.json({ error: "A product's original category is unavailable; restore was cancelled" }, { status: 409 });
    }
    const categories = await Category.find({ _id: { $in: categoryIds } }).select("_id").lean();
    if (categories.length !== categoryIds.length) {
      return Response.json({ error: "A product's original category no longer exists; restore was cancelled" }, { status: 409 });
    }

    const vendorIds = [...new Set(products.flatMap((product) => product.vendor ? [String(product.vendor)] : []))];
    const activeVendors = vendorIds.length
      ? await User.find({ _id: { $in: vendorIds }, role: "vendor", status: "active" }).select("_id").lean()
      : [];
    const activeVendorIds = new Set(activeVendors.map((vendor) => String(vendor._id)));
    const restored: string[] = [];
    const keptInactive: string[] = [];
    const failed: string[] = [];

    const results = await Promise.all(products.map(async (product) => {
      const id = String(product._id);
      const ownerCanSell = !product.vendor || activeVendorIds.has(String(product.vendor));
      const restoreActive = product.deletedActive === true && ownerCanSell;
      const result = await Product.updateOne(
        { _id: product._id, deletedAt: product.deletedAt },
        {
          $set: { active: restoreActive },
          $unset: {
            deletedAt: 1, deletedBy: 1, deletedByName: 1, deletedByRole: 1, deletedActive: 1,
          },
        },
      );
      return { id, matched: result.matchedCount === 1, keptInactive: result.matchedCount === 1 && product.deletedActive === true && !ownerCanSell };
    }));
    for (const result of results) {
      if (!result.matched) failed.push(result.id);
      else {
        restored.push(result.id);
        if (result.keptInactive) keptInactive.push(result.id);
      }
    }

    if (failed.length) {
      return Response.json({
        error: "Some products changed during restore; review the recycle bin and retry.",
        restored, failed,
      }, { status: 409 });
    }
    return Response.json({ success: true, restored, keptInactive });
  } catch (error) {
    return apiError(error);
  }
}
