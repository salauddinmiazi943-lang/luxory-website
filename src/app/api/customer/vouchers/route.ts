import { apiError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listUserVouchers } from "@/lib/reward-vouchers";

export async function GET() {
  const access = await requireUser(["customer", "reseller", "wholesaler"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const vouchers = await listUserVouchers(access.user.id);
    return Response.json({ vouchers });
  } catch (error) {
    return apiError(error);
  }
}
