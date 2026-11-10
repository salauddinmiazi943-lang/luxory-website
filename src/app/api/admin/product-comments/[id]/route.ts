import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { ProductComment } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({ reply: z.string().trim().min(2).max(2000) });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_products");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return Response.json({ error: "Invalid comment ID" }, { status: 400 });
    await connectDb();
    const item = await ProductComment.findByIdAndUpdate(
      id,
      { $set: { adminReply: parsed.data.reply, repliedBy: access.user.id, repliedAt: new Date() } },
      { new: true, runValidators: true },
    )
      .populate("product", "title slug")
      .select("product customerName message createdAt adminReply repliedAt")
      .lean();
    if (!item) return Response.json({ error: "Comment not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}
