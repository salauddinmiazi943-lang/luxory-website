import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { hasPermission, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["super_admin", "admin"]);
  if ("error" in access) return access.error;
  if (!hasPermission(access.user, "manage_products")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await connectDb();
    const items = await User.find({ role: "vendor", status: "active" }).select("name email shopName").sort({ name: 1 }).lean();
    return NextResponse.json({ items: items.map((item) => ({ id: String(item._id), name: item.shopName || item.name, email: item.email })) });
  } catch (error) {
    return apiError(error);
  }
}
