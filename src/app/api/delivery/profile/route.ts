import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().min(5).max(1000),
});

export async function GET() {
  const access = await requireUser(["delivery_staff"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const user = await User.findOne({ _id: access.user.id, role: "delivery_staff", status: "active" })
      .select("employeeId name email phone address")
      .lean();
    if (!user) return Response.json({ error: "Delivery staff profile not found" }, { status: 404 });
    return Response.json({ profile: user });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await requireUser(["delivery_staff"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const profile = await User.findOneAndUpdate(
      { _id: access.user.id, role: "delivery_staff", status: "active" },
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).select("employeeId name email phone address");
    if (!profile) return Response.json({ error: "Delivery staff profile not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
