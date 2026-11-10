import { connectDb } from "@/lib/db";
import { ProductComment } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requirePermission("manage_products");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const items = await ProductComment.find()
      .populate("product", "title slug")
      .select("product customerName message createdAt adminReply repliedAt")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
