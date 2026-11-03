import { z } from "zod";
import { connectDb } from "@/lib/db";
import { VendorApplication } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, clientKey, cloudinaryUrl, rateLimit, readJson } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(2).max(120), shopName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254), phone: z.string().trim().min(6).max(30),
  address: z.string().trim().min(5).max(1000), description: z.string().trim().min(10).max(3000),
  documents: z.array(cloudinaryUrl()).max(8).default([]),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "vendor-application"), 4)) return Response.json({ error: "Too many applications. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const pending = await VendorApplication.exists({ email: parsed.data.email.toLowerCase(), status: "pending" });
    if (pending) return Response.json({ error: "An application for this email is already pending" }, { status: 409 });
    const item = await VendorApplication.create({ ...parsed.data, email: parsed.data.email.toLowerCase() });
    return Response.json({ success: true, id: String(item._id) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  const access = await requirePermission("manage_vendors");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const items = await VendorApplication.find().sort({ createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
