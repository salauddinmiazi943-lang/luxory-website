import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Category, User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid category id");
const schema = z.object({
  productAddEnabled: z.boolean(),
  allowedCategoryIds: z.array(objectId),
  deniedCategoryIds: z.array(objectId),
  maxProducts: z.number().int().min(0).max(100_000),
  requireApproval: z.boolean(),
}).superRefine((value, context) => {
  if (new Set(value.allowedCategoryIds).size !== value.allowedCategoryIds.length) {
    context.addIssue({ code: "custom", path: ["allowedCategoryIds"], message: "Allowed category IDs must be unique" });
  }
  if (new Set(value.deniedCategoryIds).size !== value.deniedCategoryIds.length) {
    context.addIssue({ code: "custom", path: ["deniedCategoryIds"], message: "Denied category IDs must be unique" });
  }
  if (value.allowedCategoryIds.some((id) => value.deniedCategoryIds.includes(id))) {
    context.addIssue({ code: "custom", path: ["deniedCategoryIds"], message: "A category cannot be both allowed and denied" });
  }
  if (value.productAddEnabled && value.allowedCategoryIds.length === 0) {
    context.addIssue({ code: "custom", path: ["allowedCategoryIds"], message: "Select at least one allowed category" });
  }
  if (value.productAddEnabled && value.maxProducts === 0) {
    context.addIssue({ code: "custom", path: ["maxProducts"], message: "Set a product limit above zero before enabling product creation" });
  }
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requireUser(["super_admin"]);
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid vendor id" }, { status: 400 });
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();

    const categoryIds = [...parsed.data.allowedCategoryIds, ...parsed.data.deniedCategoryIds];
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categoryCount = await Category.countDocuments({ _id: { $in: uniqueCategoryIds } });
    if (categoryCount !== uniqueCategoryIds.length) {
      return Response.json({ error: "One or more selected categories no longer exist" }, { status: 409 });
    }

    const item = await User.findOneAndUpdate(
      { _id: id, role: "vendor" },
      {
        $set: {
          vendorProductPermissions: {
            productAddEnabled: parsed.data.productAddEnabled,
            allowedCategoryIds: parsed.data.allowedCategoryIds.map((categoryId) => new mongoose.Types.ObjectId(categoryId)),
            deniedCategoryIds: parsed.data.deniedCategoryIds.map((categoryId) => new mongoose.Types.ObjectId(categoryId)),
            maxProducts: parsed.data.maxProducts,
            requireApproval: parsed.data.requireApproval,
          },
        },
      },
      { new: true, runValidators: true },
    ).select("_id name vendorProductPermissions").lean();
    if (!item) return Response.json({ error: "Vendor not found" }, { status: 404 });
    return Response.json({
      item: {
        id: String(item._id),
        name: item.name,
        permissions: {
          productAddEnabled: item.vendorProductPermissions?.productAddEnabled === true,
          allowedCategoryIds: (item.vendorProductPermissions?.allowedCategoryIds ?? []).map(String),
          deniedCategoryIds: (item.vendorProductPermissions?.deniedCategoryIds ?? []).map(String),
          maxProducts: item.vendorProductPermissions?.maxProducts ?? 0,
          requireApproval: item.vendorProductPermissions?.requireApproval !== false,
        },
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
