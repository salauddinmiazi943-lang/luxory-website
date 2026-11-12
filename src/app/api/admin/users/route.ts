import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const permissions = ["manage_categories", "manage_banners", "manage_products", "manage_featured", "view_bookings", "manage_bookings", "manage_delivery_staff", "manage_vendors", "view_messages"] as const;
const createSchema = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128), permissions: z.array(z.enum(permissions)).max(permissions.length).default([]),
});

export async function GET() {
  try {
    const access = await requireUser(["super_admin"]);  
    if ("error" in access) return access.error;  
  
    await connectDb();
    const items = await User.find({ role: "admin" }).select("-passwordHash").sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireUser(["super_admin"]);  
    if ("error" in access) return access.error;  
  
    const parsed = await readJson(request, createSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const item = await User.create({
      name: parsed.data.name, email: parsed.data.email.toLowerCase(), role: "admin",
      permissions: parsed.data.permissions, passwordHash: await bcrypt.hash(parsed.data.password, 12),
    });
    return NextResponse.json({ item: { id: String(item._id), name: item.name, email: item.email, role: item.role, permissions: item.permissions } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
