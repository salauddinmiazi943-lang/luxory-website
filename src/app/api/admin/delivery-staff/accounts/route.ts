import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { hasEmployeeIdUniqueIndex } from "@/lib/delivery-staff";

const employeeId = z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9-]+$/).transform((value) => value.toUpperCase());
const createSchema = z.object({
  employeeId,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().min(5).max(1000),
  password: z.string().min(10).max(128),
});

export async function GET() {
  const access = await requirePermission("manage_delivery_staff");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const items = await User.find({ role: "delivery_staff" })
      .select("employeeId name email phone address status createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_delivery_staff");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, createSchema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    if (!(await hasEmployeeIdUniqueIndex())) {
      return Response.json({ error: "Employee ID index is not installed. Apply the delivery staff index migration before creating accounts." }, { status: 503 });
    }
    const { password, ...profile } = parsed.data;
    const item = await User.create({
      ...profile,
      email: profile.email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role: "delivery_staff",
      permissions: [],
    });
    return Response.json({
      item: {
        id: String(item._id), employeeId: item.employeeId, name: item.name, email: item.email,
        phone: item.phone, address: item.address, status: item.status,
      },
    }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return Response.json({ error: "An account with this email or employee ID already exists" }, { status: 409 });
    }
    return apiError(error);
  }
}
