import mongoose from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Product, ProductComment } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, clientKey, cloudinaryUrl, rateLimit, readJson } from "@/lib/http";

const commentSchema = z.object({
  message: z.string().trim().min(2).max(2000),
  rating: z.number().int().min(1).max(5),
  images: z.array(cloudinaryUrl()).max(4).default([]),
});
type Context = { params: Promise<{ id: string }> };

async function findProduct(id: string) {
  return Product.findOne({
    ...(mongoose.isValidObjectId(id) ? { _id: id } : { slug: id }),
    deletedAt: { $exists: false },
  })
    .select("_id active approved")
    .lean();
}

export async function GET(_request: Request, { params }: Context) {
  try {
    await connectDb();
    const { id } = await params;
    const product = await findProduct(id);
    if (!product || !product.active || !product.approved) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const items = await ProductComment.find({ product: product._id })
      .select("customerName message rating images createdAt adminReply repliedAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const access = await requireUser();
  if ("error" in access) return access.error;
  if (!rateLimit(clientKey(request, `product-comment:${access.user.id}`), 5, 60_000)) {
    return Response.json({ error: "Too many comments. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, commentSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const { id } = await params;
    const product = await findProduct(id);
    if (!product || !product.active || !product.approved) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const item = await ProductComment.create({
      product: product._id,
      customer: access.user.id,
      customerName: access.user.name,
      message: parsed.data.message,
      rating: parsed.data.rating,
      images: parsed.data.images,
    });
    return Response.json({
      item: {
        _id: String(item._id),
        customerName: item.customerName,
        message: item.message,
        rating: item.rating,
        images: item.images,
        createdAt: item.createdAt,
        adminReply: "",
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
