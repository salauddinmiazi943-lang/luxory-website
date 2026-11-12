import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const permissions = ["manage_categories", "manage_banners", "manage_products", "manage_featured", "view_bookings", "manage_bookings", "manage_delivery_staff", "manage_vendors", "view_messages"] as const;
const schema = z.object({ status: z.enum(["active", "inactive"]).optional(), permissions: z.array(z.enum(permissions)).max(permissions.length).optional() });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const access = await requireUser(["super_admin"]);  
    if ("error" in access) return access.error;  
  
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    await connectDb();
    const user = await User.findOneAndUpdate({ _id: id, role: "admin" }, parsed.data, { new: true, runValidators: true }).select("-passwordHash");
    if (!user) return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    return NextResponse.json({ item: user });
  } catch (error) {
    return apiError(error);
  }
}
