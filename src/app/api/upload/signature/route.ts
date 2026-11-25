import { createHash } from "node:crypto";
import { getSession, hasPermission, requireUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/http";

export async function POST(request: Request) {
  const session = await getSession();
  const form = await request.formData().catch(() => null);
  const purpose = form?.get("purpose");
  if (!session && purpose !== "vendor-document") {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session) {
    const access = await requireUser(["super_admin", "admin", "vendor", "customer", "reseller", "wholesaler"]);
    if ("error" in access) return access.error;
    if (["customer", "reseller", "wholesaler"].includes(access.user.role) && purpose !== "vendor-document" && purpose !== "product-review") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (access.user.role === "admin" && !["manage_categories", "manage_banners", "manage_products"].some((permission) => hasPermission(access.user, permission))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (!rateLimit(clientKey(request, "upload"), session ? 40 : 6, 60_000)) {
    return Response.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return Response.json({ error: "Image uploads are not configured" }, { status: 503 });
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = purpose === "vendor-document" ? "eshop/vendor-documents" : purpose === "product-review" ? "eshop/product-reviews" : "eshop";
  const allowedFormats = purpose === "vendor-document" ? "pdf,jpg,jpeg,png,webp" : "jpg,jpeg,png,webp";
  const signature = createHash("sha1").update(`allowed_formats=${allowedFormats}&folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  return Response.json({ cloudName, apiKey, timestamp, folder, signature, allowedFormats });
}
