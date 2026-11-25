import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["super_admin"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const [vendors, categories, productCounts] = await Promise.all([
      User.find({ role: "vendor", status: "active" }).select("name shopName email status vendorProductPermissions").sort({ name: 1 }).lean(),
      Category.find({}).select("name parentCategory active").sort({ order: 1, "name.en": 1 }).lean(),
      Product.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { vendor: { $exists: true, $ne: null } } },
        { $group: { _id: "$vendor", count: { $sum: 1 } } },
      ]),
    ]);
    const counts = new Map(productCounts.map((entry) => [String(entry._id), entry.count]));
    return Response.json({
      vendors: vendors.map((vendor) => ({
        id: String(vendor._id),
        name: vendor.name,
        shopName: vendor.shopName ?? "",
        email: vendor.email,
        status: vendor.status,
        productCount: counts.get(String(vendor._id)) ?? 0,
        permissions: {
          productAddEnabled: vendor.vendorProductPermissions?.productAddEnabled === true,
          allowedCategoryIds: (vendor.vendorProductPermissions?.allowedCategoryIds ?? []).map(String),
          deniedCategoryIds: (vendor.vendorProductPermissions?.deniedCategoryIds ?? []).map(String),
          maxProducts: vendor.vendorProductPermissions?.maxProducts ?? 0,
          requireApproval: vendor.vendorProductPermissions?.requireApproval !== false,
        },
      })),
      categories: categories.map((category) => ({
        id: String(category._id),
        name: category.name,
        parentCategory: category.parentCategory ? String(category.parentCategory) : null,
        active: category.active,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
