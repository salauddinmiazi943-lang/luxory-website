import { z } from "zod";
import { apiError, readJson } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { validateVoucherForCheckout } from "@/lib/reward-vouchers";

const schema = z.object({
  voucherCode: z.string().trim().min(1).max(40),
  payableAmount: z.number().min(0).max(100000000),
});

export async function POST(request: Request) {
  const access = await requireUser(["customer", "reseller", "wholesaler"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const result = await validateVoucherForCheckout(access.user.id, parsed.data.voucherCode, parsed.data.payableAmount);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });
    if (!result.voucher) return Response.json({ ok: false, error: "Voucher not found." }, { status: 400 });
    return Response.json({
      ok: true,
      voucher: { code: result.voucherCode, amount: result.voucher.amount, minOrderAmount: result.voucher.minOrderAmount, discountBdt: result.discountBdt, expiresAt: result.voucher.expiresAt },
    });
  } catch (error) {
    return apiError(error);
  }
}
