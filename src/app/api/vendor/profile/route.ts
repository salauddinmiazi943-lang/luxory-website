import { z } from "zod";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { User } from "@/lib/models";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().min(5).max(1000),
});

export async function GET() {
  const access = await requireUser(["vendor"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const profile = await User.findById(access.user.id).select("name email shopName phone address").lean();
    if (!profile) return Response.json({ error: "Vendor not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await requireUser(["vendor"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const profile = await User.findOneAndUpdate({ _id: access.user.id, role: "vendor" }, parsed.data, { new: true, runValidators: true }).select("name email shopName phone address");
    if (!profile) return Response.json({ error: "Vendor not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
