import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["delivery_staff"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const orders = await Order.find({ "delivery.assignment.assignedTo": access.user.id })
      .sort({ createdAt: -1 })
      .lean();
    const items = orders.map((order) => ({
      _id: String(order._id),
      status: order.status,
      total: order.total,
      paymentMethod: order.paymentMethod,
      customerInfo: {
        name: order.customerInfo.name,
        phone: order.customerInfo.phone,
        address: order.customerInfo.address,
        division: order.customerInfo.division,
        district: order.customerInfo.district,
        upazila: order.customerInfo.upazila,
        union: order.customerInfo.union,
        area: order.customerInfo.area,
      },
      items: order.items.map((item) => ({
        title: item.title,
        variantLabel: item.variantLabel,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: item.status,
      })),
    }));
    return Response.json({
      counts: {
        assigned: items.length,
        pending: items.filter((item) => !["delivered", "failed", "cancelled"].includes(item.status)).length,
        completed: items.filter((item) => item.status === "delivered").length,
        failed: items.filter((item) => item.status === "failed").length,
      },
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}
