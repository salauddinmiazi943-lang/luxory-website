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
    const users = await User.find({
      status: "active",
      $or: [{ role: "vendor" }, { role: "admin", permissions: "manage_bookings" }],
    }).select("name role").sort({ name: 1 }).lean();
    return NextResponse.json({
      items: users.map((user) => ({ id: String(user._id), name: user.name, role: user.role })),
    });
  } catch (error) {
    return apiError(error);
  }
}
