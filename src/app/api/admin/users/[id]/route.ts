import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ status: z.enum(["active", "inactive"]).optional(), permissions: z.array(z.enum(ADMIN_PERMISSIONS)).optional() });
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

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const access = await requireUser(["super_admin"]);
    if ("error" in access) return access.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    if (id === access.user.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    await connectDb();
    const user = await User.findOneAndDelete({ _id: id, role: "admin" }).select("_id").lean();
    if (!user) return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
