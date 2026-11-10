import { apiError } from "@/lib/http";
import { resolveDefaultDeliveryCharge } from "@/lib/delivery-charge";

export async function GET() {
  try {
    return Response.json({ defaultDeliveryCharge: await resolveDefaultDeliveryCharge() });
  } catch (error) {
    return apiError(error);
  }
}
