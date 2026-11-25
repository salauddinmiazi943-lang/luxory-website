import { connectDb } from "@/lib/db";
import { AuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  const access = await requireUser(["super_admin", "admin"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const items = await AuditLog.find({}).sort({ createdAt: -1 }).limit(500).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
