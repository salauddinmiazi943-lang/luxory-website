import { z } from "zod";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { Order, Product } from "@/lib/models";
import { getSession, requirePermission, requireUser } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { isValidQuantity } from "@/lib/product-units";

const schema = z.object({
  customerInfo: z.object({
    name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30),
    address: z.string().trim().min(5).max(1000), notes: z.string().trim().max(2000).default(""),
  }),
  items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), variantId: z.string().regex(/^[a-f\d]{24}$/i).optional(), quantity: z.number().positive().max(100_000) })).min(1).max(30)
    .superRefine((items, context) => {
      const keys = items.map((item) => `${item.productId}:${item.variantId ?? ""}`);
      if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Each product option can appear only once", path: [] });
    }),
  paymentMethod: z.literal("COD").default("COD"),
});

export async function GET() {
  const access = await requireUser();
  if ("error" in access) return access.error;
  try {
    await connectDb();
    if (access.user.role === "super_admin" || access.user.role === "admin") {
      const access = await requirePermission("view_bookings");
      if ("error" in access) return access.error;
      const items = await Order.find().sort({ createdAt: -1 }).populate("customer", "name email").lean();
      return Response.json({ items });
    }
    if (access.user.role === "vendor") {
      const orders = await Order.find({ "items.vendorId": access.user.id }).sort({ createdAt: -1 }).lean();
      const items = orders.map((order) => {
        const vendorItems = order.items.filter((item) => String(item.vendorId) === access.user.id);
        return { ...order, items: vendorItems, total: vendorItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) };
      });
      return Response.json({ items });
    }
    if (access.user.role !== "customer") return Response.json({ error: "Forbidden" }, { status: 403 });
    const items = await Order.find({ $or: [{ customer: access.user.id }, { "customerInfo.email": access.user.email }] }).sort({ createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "checkout"), 8)) return Response.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const products = await Product.find({ _id: { $in: parsed.data.items.map((item) => item.productId) }, active: true, approved: true }).lean();
    if (products.length !== new Set(parsed.data.items.map((item) => item.productId)).size) return Response.json({ error: "One or more products are unavailable" }, { status: 400 });
    const orderItems = parsed.data.items.map((line) => {
      const product = products.find((candidate) => String(candidate._id) === line.productId);
      if (!product) throw new Error("One or more products are unavailable");
      const variants = product.variants as { _id: unknown; stock: number; price: number; label: string }[] | undefined;
      const variant = line.variantId ? variants?.find((option) => String(option._id) === line.variantId) : undefined;
      if (line.variantId && !variant) throw new Error("A selected product option is no longer available");
      if (!line.variantId && variants?.length) throw new Error("Choose an option for each product");
      if (!isValidQuantity(product.unit, line.quantity)) throw new Error(`Quantity must use valid ${product.unit ?? "piece"} increments`);
      if ((variant?.stock ?? product.stock) < line.quantity) throw new Error("Insufficient stock for one or more products");
      return {
        productId: product._id, vendorId: product.vendor, title: product.title.en,
        ...(variant && line.variantId ? { variantId: new mongoose.Types.ObjectId(line.variantId), variantLabel: variant.label } : {}),
        unit: product.unit ?? "piece", image: product.images[0] ?? "", quantity: line.quantity,
        unitPrice: variant?.price ?? product.discountPrice ?? product.price, status: "pending" as const,
      };
    });
    const session = await getSession();
    let customerId: string | undefined;
    let customerEmail: string | undefined;
    if (session) {
      const access = await requireUser();
      if ("error" in access) return access.error;
      if (access.user.role === "customer") {
        customerId = access.user.id;
        customerEmail = access.user.email;
      }
    }
    const reserved: { id: string; variantId?: string; quantity: number }[] = [];
    try {
      for (const line of orderItems) {
        const stockQuery = line.variantId
          ? {
              _id: line.productId, active: true, approved: true, stock: { $gte: line.quantity },
              variants: { $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity } } },
            }
          : {
              _id: line.productId, active: true, approved: true, stock: { $gte: line.quantity },
              $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }],
            };
        const stockUpdate = line.variantId
          ? { $inc: { stock: -line.quantity, "variants.$.stock": -line.quantity } }
          : { $inc: { stock: -line.quantity } };
        const updated = await Product.findOneAndUpdate(stockQuery, stockUpdate, { new: true });
        if (!updated) throw new Error("Stock changed during checkout. Please try again.");
        reserved.push({ id: String(line.productId), ...(line.variantId ? { variantId: String(line.variantId) } : {}), quantity: line.quantity });
      }
      const order = await Order.create({
        customer: customerId,
        customerInfo: { ...parsed.data.customerInfo, email: customerEmail }, items: orderItems,
        total: orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), paymentMethod: "COD",
      });
      return Response.json({ item: order }, { status: 201 });
    } catch (error) {
      await Promise.all(reserved.map((line) => Product.updateOne(
        { _id: line.id },
        { $inc: { stock: line.quantity, ...(line.variantId ? { "variants.$[variant].stock": line.quantity } : {}) } },
        line.variantId ? { arrayFilters: [{ "variant._id": line.variantId }] } : undefined,
      )));
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes("stock") || error.message.includes("Stock"))) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return apiError(error);
  }
}
