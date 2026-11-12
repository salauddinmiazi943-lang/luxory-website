import { z } from "zod";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { Order, Product, UserWallet, CoinTransaction } from "@/lib/models";
import { getSession, requirePermission, requireUser } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { isValidQuantity } from "@/lib/product-units";
import { discountPercent, normalizeBuyerRole, resolveSimplePricing, resolveVariantPricing, roleMoq, roleUnitPrice } from "@/lib/pricing";
import { resolveDefaultDeliveryCharge } from "@/lib/delivery-charge";
import { validateRedeemRequest } from "@/lib/coin-rewards";
import { markVoucherUsed, validateVoucherForCheckout } from "@/lib/reward-vouchers";
import { auditProtectionMode, verifyDeliveryAudit } from "@/lib/delivery-audit";
import { createDeliveryAccessKey } from "@/lib/delivery-security";
import { resolveBangladeshAddress } from "@/lib/bangladesh-locations";

const schema = z.object({
  customerInfo: z.object({
    name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30),
    division: z.string().trim().min(2).max(120), district: z.string().trim().min(2).max(120),
    upazila: z.string().trim().min(2).max(120), area: z.string().trim().max(120).optional().default(""),
    divisionId: z.string().max(12).optional(), districtId: z.string().max(12).optional(),
    upazilaId: z.string().max(12).optional(), unionId: z.string().max(12).optional(),
    union: z.string().trim().max(120).optional().default(""),
    address: z.string().trim().min(5).max(500), notes: z.string().trim().max(2000).default(""),
  }),
  items: z.array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), variantId: z.string().regex(/^[a-f\d]{24}$/i).optional(), quantity: z.number().positive().max(100_000) })).min(1).max(30)
    .superRefine((items, context) => {
      const keys = items.map((item) => `${item.productId}:${item.variantId ?? ""}`);
      if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Each product option can appear only once", path: [] });
    }),
  paymentMethod: z.literal("COD").default("COD"),
  redeemCoins: z.number().int().min(0).max(10000000).optional().default(0),
  voucherCode: z.string().trim().max(40).optional().default(""),
});

export async function GET() {
  const access = await requireUser();
  if ("error" in access) return access.error;
  try {
    await connectDb();
    if (access.user.role === "super_admin" || access.user.role === "admin") {
      const access = await requirePermission("view_bookings");
      if ("error" in access) return access.error;
      const orders = await Order.find().sort({ createdAt: -1 }).populate("customer", "name email").lean();
      const items = orders.map((order) => ({
        ...order,
        deliveryAuditValid: verifyDeliveryAudit(String(order._id), order.deliveryAudit ?? []),
        deliveryAuditProtection: auditProtectionMode(),
      }));
      return Response.json({ items });
    }
    if (access.user.role === "vendor") {
      const orders = await Order.find({
        $or: [{ "items.vendorId": access.user.id }, { "delivery.handovers.assignedTo": access.user.id }],
      }).sort({ createdAt: -1 }).lean();
      const items = orders.map((order) => {
        const assignedLines = new Set((order.delivery?.handovers ?? []).filter((entry) => entry.assignedTo === access.user.id)
          .map((entry) => `${String(entry.productId)}:${String(entry.variantId ?? "")}`));
        const vendorItems = order.items.filter((item) => String(item.vendorId) === access.user.id ||
          assignedLines.has(`${String(item.productId)}:${String(item.variantId ?? "")}`));
        const subtotal = vendorItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        return {
          ...order,
          items: vendorItems,
          subtotal,
          total: subtotal,
          deliveryCharge: 0,
          delivery: {
            verificationStatus: order.delivery?.verificationStatus,
            deliveredAt: order.delivery?.deliveredAt,
            deliveredBy: order.delivery?.deliveredBy,
            notes: order.delivery?.notes,
            failedAt: order.delivery?.failedAt,
            failedBy: order.delivery?.failedBy,
            failedReason: order.delivery?.failedReason,
            handovers: (order.delivery?.handovers ?? []).filter((entry) => entry.assignedTo === access.user.id),
          },
          deliveryAudit: undefined,
        };
      });
      return Response.json({ items });
    }
    if (access.user.role !== "customer") return Response.json({ error: "Forbidden" }, { status: 403 });
    const orders = await Order.find({ $or: [{ customer: access.user.id }, { "customerInfo.email": access.user.email }] }).sort({ createdAt: -1 }).lean();
    const items = orders.map((order) => ({
      ...order,
      deliveryAudit: undefined,
      delivery: {
        verificationStatus: order.delivery?.verificationStatus,
        deliveredAt: order.delivery?.deliveredAt,
        notes: order.delivery?.notes,
        notifications: order.delivery?.notifications,
        reports: order.delivery?.reports?.filter((report) => report.customerId === access.user.id),
      },
    }));
    return Response.json({ items });
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return apiError(error);
  }
}
// Guest checkout is allowed (no login required). Rate-limited to reduce abuse.
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "checkout"), 8)) return Response.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const submittedLocation = parsed.data.customerInfo;
    const hasLocationIds = Boolean(
      submittedLocation.divisionId || submittedLocation.districtId ||
      submittedLocation.upazilaId,
    );
    const location = hasLocationIds
      ? submittedLocation.divisionId && submittedLocation.districtId
        ? resolveBangladeshAddress({
            divisionId: submittedLocation.divisionId,
            districtId: submittedLocation.districtId,
            ...(submittedLocation.upazilaId ? { upazilaId: submittedLocation.upazilaId } : {}),
          })
        : null
      : undefined;
    if (hasLocationIds && !location) {
      return Response.json({ error: "The selected address locations do not match." }, { status: 400 });
    }
    const session = await getSession();
    let customerId: string | undefined;
    let customerEmail: string | undefined;
    let buyerRole: "retail" | "reseller" | "wholesaler" = "retail";
    if (session) {
      const access = await requireUser();
      if ("error" in access) return access.error;
      if (access.user.role === "customer" || access.user.role === "reseller" || access.user.role === "wholesaler") {
        customerId = access.user.id;
        customerEmail = access.user.email;
      }
      if (access.user.role === "reseller") buyerRole = "reseller";
      if (access.user.role === "wholesaler") buyerRole = "wholesaler";
    }
    await connectDb();
    const products = await Product.find({ _id: { $in: parsed.data.items.map((item) => item.productId) }, active: true, approved: true }).lean();
    if (products.length !== new Set(parsed.data.items.map((item) => item.productId)).size) return Response.json({ error: "One or more products are unavailable" }, { status: 400 });
    const orderItems = parsed.data.items.map((line) => {
      const product = products.find((candidate) => String(candidate._id) === line.productId);
      if (!product) throw new Error("One or more products are unavailable");
      const variants = product.variants as { _id: unknown; stock: number; price: number; originalPrice?: number; label: string }[] | undefined;
      const variant = line.variantId ? variants?.find((option) => String(option._id) === line.variantId) : undefined;
      if (line.variantId && !variant) throw new Error("A selected product option is no longer available");
      if (!line.variantId && variants?.length) throw new Error("Choose an option for each product");
      if (!isValidQuantity(product.unit, line.quantity)) throw new Error(`Quantity must use valid ${product.unit ?? "piece"} increments`);
      if ((variant?.stock ?? product.stock) < line.quantity) throw new Error("Insufficient stock for one or more products");
      // Server verifies prices from DB; never trust client-submitted totals/prices.
      const basePricing = variant ? resolveVariantPricing(variant) : resolveSimplePricing(product);
      const moq = variant ? 1 : roleMoq(product, buyerRole);
      if (line.quantity < moq) throw new Error(`Minimum order quantity for this product is ${moq} ${product.unit ?? "piece"}`);
      const unitPrice = variant ? basePricing.current : roleUnitPrice(product, basePricing.current, buyerRole);
      const pricing = { ...basePricing, current: unitPrice, original: basePricing.original > unitPrice ? basePricing.original : unitPrice };
      const originalPrice = pricing.original > unitPrice ? pricing.original : undefined;
      const lineTotal = unitPrice * line.quantity;
      return {
        productId: product._id, vendorId: product.vendor, title: product.title.en,
        ...(variant && line.variantId ? { variantId: new mongoose.Types.ObjectId(line.variantId), variantLabel: variant.label } : {}),
        unit: product.unit ?? "piece", image: product.images[0] ?? "", quantity: line.quantity,
        ...(originalPrice ? { originalPrice } : {}),
        unitPrice,
        ...(originalPrice ? { discountPercent: discountPercent(originalPrice, unitPrice) } : {}),
        lineTotal,
        status: "pending" as const,
      };
    });

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
      const deliveryAccess = customerId ? undefined : createDeliveryAccessKey();
      const deliveryCharge = await resolveDefaultDeliveryCharge();
      const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      let coinDiscount = 0;
      let coinsRedeemed = 0;
      const requestedRedeem = Math.floor(Number(parsed.data.redeemCoins || 0));
      if (requestedRedeem > 0) {
        if (!customerId) return Response.json({ error: "Sign in to redeem coins." }, { status: 401 });
        const redeem = await validateRedeemRequest(customerId, requestedRedeem, subtotal + deliveryCharge);
        if (!redeem.ok) return Response.json({ error: redeem.error }, { status: 400 });
        coinDiscount = Number(redeem.discountBdt.toFixed(2));
        coinsRedeemed = redeem.coins;
      }
      let voucherDiscount = 0;
      let appliedVoucherId: string | null = null;
      let appliedVoucherCode = "";
      const payableAfterCoin = Math.max(0, subtotal + deliveryCharge - coinDiscount);
      const requestedVoucher = String(parsed.data.voucherCode || "").trim();
      if (requestedVoucher) {
        if (!customerId) return Response.json({ error: "Sign in to use a voucher." }, { status: 401 });
        const v = await validateVoucherForCheckout(customerId, requestedVoucher, payableAfterCoin);
        if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
        if (v.voucher) { voucherDiscount = Number(v.discountBdt.toFixed(2)); appliedVoucherId = String(v.voucher._id); appliedVoucherCode = v.voucherCode; }
      }
      const total = Math.max(0, subtotal + deliveryCharge - coinDiscount - voucherDiscount);
      const { division, district, upazila, area, address, union, ...customerDetails } = submittedLocation;
      const order = await Order.create({
        customer: customerId,
        customerInfo: {
          ...customerDetails,
          division: location?.division.name ?? division,
          divisionId: location?.division.id ?? submittedLocation.divisionId,
          divisionBn: location?.division.bnName,
          district: location?.district.name ?? district,
          districtId: location?.district.id ?? submittedLocation.districtId,
          districtBn: location?.district.bnName,
          upazila: location?.upazila?.name ?? upazila,
          upazilaId: location?.upazila?.id ?? submittedLocation.upazilaId,
          upazilaBn: location?.upazila?.bnName,
          union,
          unionId: submittedLocation.unionId,
          unionBn: undefined,
          area: (area ?? "").trim(),
          address,
          email: customerEmail,
        },
        items: orderItems,
        subtotal,
        deliveryCharge,
        total,
        ...(coinDiscount > 0 ? { coinDiscount, coinsRedeemed } : {}),
        ...(voucherDiscount > 0 && appliedVoucherCode ? { voucherDiscount, voucherCode: appliedVoucherCode } : {}),
        ...(deliveryAccess ? { delivery: { accessKeyHash: deliveryAccess.hash } } : {}),
      });
      if (coinsRedeemed > 0 && customerId) {
        const dec = await UserWallet.updateOne({ userId: customerId, balanceCoins: { $gte: coinsRedeemed } }, { $inc: { balanceCoins: -coinsRedeemed, totalRedeemedCoins: coinsRedeemed } });
        if (!dec.modifiedCount) throw new Error("Insufficient coin balance.");
        await CoinTransaction.create({
          userId: customerId,
          orderId: order._id,
          amount: -coinsRedeemed,
          type: "redeem",
          description: `Coins redeemed for order ${String(order._id)} (discount ৳${coinDiscount.toLocaleString("en-BD")})`,
        });
      }
      if (appliedVoucherId && customerId) {
        const used = await markVoucherUsed(appliedVoucherId, customerId, String(order._id));
        if (!used) throw new Error("Voucher could not be applied. It may have been used or expired.");
      }
      return Response.json({
        item: { _id: String(order._id) },
        ...(deliveryAccess ? { deliveryAccessKey: deliveryAccess.key } : {}),
      }, { status: 201 });
    } catch (stockError) {
      for (const entry of reserved) {
        if (entry.variantId) await Product.updateOne({ _id: entry.id, "variants._id": entry.variantId }, { $inc: { stock: entry.quantity, "variants.$.stock": entry.quantity } });
        else await Product.updateOne({ _id: entry.id }, { $inc: { stock: entry.quantity } });
      }
      throw stockError;
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes("stock") || error.message.includes("Stock") || error.message.includes("unavailable") || error.message.includes("changed during checkout") || error.message.includes("Minimum order quantity"))) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/orders error:", error);
    return apiError(error);
  }
}


