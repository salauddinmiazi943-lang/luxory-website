import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Product, User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { isValidQuantity } from "@/lib/product-units";

const schema = z.object({ items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), variantId: z.string().regex(/^[a-f\d]{24}$/i).optional(), quantity: z.number().positive().max(100_000) })).max(30) })
  .superRefine((value, context) => {
    const ids = value.items.map((item) => `${item.productId}:${item.variantId ?? ""}`);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["items"], message: "Cart product options must be unique" });
  });

export async function GET() {
  const access = await requireUser(["customer"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const user = await User.findById(access.user.id).select("cart").lean();
    const lines = user?.cart ?? [];
    const products = await Product.find({ _id: { $in: lines.map((line) => line.productId) }, active: true, approved: true }).lean();
    const items = lines.flatMap((line) => {
      const product = products.find((candidate) => String(candidate._id) === String(line.productId));
      if (!product) return [];
      const variants = product.variants as { _id: unknown; stock: number; price: number; label: string }[] | undefined;
      const variant = line.variantId ? variants?.find((option) => String(option._id) === String(line.variantId)) : undefined;
      if (line.variantId && !variant) return [];
      if (!line.variantId && variants?.length) return [];
      const stock = variant?.stock ?? product.stock;
      const price = variant?.price ?? product.discountPrice ?? product.price;
      return [{
        id: String(product._id), slug: product.slug, name: product.title.en, image: product.images[0] ?? "",
        price, quantity: Math.min(line.quantity, stock), unit: product.unit ?? "piece",
        ...(variant ? { variantId: String(variant._id), variantLabel: variant.label } : {}),
      }].filter((item) => item.quantity > 0);
    });
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  const access = await requireUser(["customer"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const productIds = parsed.data.items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds }, active: true, approved: true }).select("_id variants unit").lean();
    if (products.length !== new Set(productIds).size) return Response.json({ error: "Cart contains an unavailable product" }, { status: 400 });
    for (const line of parsed.data.items) {
      const product = products.find((item) => String(item._id) === line.productId);
      if (!product) return Response.json({ error: "Cart contains an unavailable product" }, { status: 400 });
      if (!isValidQuantity(product.unit, line.quantity)) {
        return Response.json({ error: "Invalid quantity for the selected product unit" }, { status: 400 });
      }
      const variants = product.variants as { _id: unknown }[] | undefined;
      if (line.variantId && !variants?.some((variant) => String(variant._id) === line.variantId)) {
        return Response.json({ error: "Cart contains an unavailable product option" }, { status: 400 });
      }
      if (!line.variantId && variants?.length) return Response.json({ error: "Choose an option for each product" }, { status: 400 });
    }
    await User.updateOne({ _id: access.user.id }, { $set: { cart: parsed.data.items.map((item) => ({ productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: item.quantity })) } });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
