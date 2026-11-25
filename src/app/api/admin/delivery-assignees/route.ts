import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const access = await requirePermission("manage_bookings");  
    if ("error" in access) return access.error;  
  
    await connectDb();
    const items = await User.find({ role: "delivery_staff", status: "active" })
      .select("name employeeId")
      .sort({ name: 1 })
      .lean();
    return NextResponse.json({ items: items.map((item) => ({ id: String(item._id), name: item.name, employeeId: item.employeeId })) });
  } catch (error) {
    return apiError(error);
  }
}
