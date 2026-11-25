import { connectDb } from "@/lib/db";
import { Category, Product, User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["vendor"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const [vendor, productCount, categories] = await Promise.all([
      User.findOne({ _id: access.user.id, role: "vendor", status: "active" })
        .select("vendorProductPermissions")
        .lean(),
      Product.countDocuments({ vendor: access.user.id }),
      Category.find({ active: true })
        .select("name slug parentCategory variantTemplate active")
        .sort({ order: 1, "name.en": 1 })
        .lean(),
    ]);
    if (!vendor) return Response.json({ error: "Vendor account not found" }, { status: 404 });
    const permissions = vendor.vendorProductPermissions;
    return Response.json({
      permissions: {
        productAddEnabled: permissions?.productAddEnabled === true,
        allowedCategoryIds: (permissions?.allowedCategoryIds ?? []).map(String),
        deniedCategoryIds: (permissions?.deniedCategoryIds ?? []).map(String),
        maxProducts: permissions?.maxProducts ?? 0,
        requireApproval: permissions?.requireApproval !== false,
      },
      productCount,
      categories,
    });
  } catch (error) {
    return apiError(error);
  }
}
