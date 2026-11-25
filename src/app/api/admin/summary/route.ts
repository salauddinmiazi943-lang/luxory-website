import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Order, Product, User, VendorApplication } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const access = await requireUser(["super_admin", "admin"]);  
    if ("error" in access) return access.error;  
  
    await connectDb();
    const canSeeOrders = hasPermission(access.user, "view_bookings");
    const canSeeProducts = hasPermission(access.user, "manage_products");
    const canSeeVendors = hasPermission(access.user, "manage_vendors");
    const [orders, products, vendors, pendingApplications] = await Promise.all([
      canSeeOrders ? Order.countDocuments() : 0,
      canSeeProducts ? Product.countDocuments({ deletedAt: { $exists: false } }) : 0,
      canSeeVendors ? User.countDocuments({ role: "vendor", status: "active" }) : 0,
      canSeeVendors ? VendorApplication.countDocuments({ status: "pending" }) : 0,
    ]);
    return NextResponse.json({ ...(canSeeOrders ? { orders } : {}), ...(canSeeProducts ? { products } : {}), ...(canSeeVendors ? { vendors, pendingApplications } : {}) });
  } catch (error) {
    return apiError(error);
  }
}
