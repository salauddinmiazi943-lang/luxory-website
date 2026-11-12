import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { hasEmployeeIdUniqueIndex } from "@/lib/delivery-staff";

const schema = z.object({
  employeeId: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9-]+$/).transform((value) => value.toUpperCase()).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  address: z.string().trim().min(5).max(1000).optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one profile field or status");
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const access = await requirePermission("manage_delivery_staff");  
    if ("error" in access) return access.error;  
  
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid delivery staff ID" }, { status: 400 });
    await connectDb();
    if (parsed.data.employeeId !== undefined && !(await hasEmployeeIdUniqueIndex())) {
      return NextResponse.json({ error: "Employee ID index is not installed. Apply the delivery staff index migration before changing employee IDs." }, { status: 503 });
    }
    const item = await User.findOneAndUpdate(
      { _id: id, role: "delivery_staff" },
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).select("employeeId name email phone address status createdAt");
    if (!item) return NextResponse.json({ error: "Delivery staff account not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "That employee ID is already in use" }, { status: 409 });
    }
    return apiError(error);
  }
}
