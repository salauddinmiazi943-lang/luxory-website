import { z } from "zod";
import { connectDb } from "@/lib/db";
import { ContactMessage } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(1000).optional().default(""),
  inquiryType: z.string().trim().max(40).optional().default(""),
  subject: z.string().trim().min(2).max(160), message: z.string().trim().min(10).max(4000),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "contact"), 5)) return Response.json({ error: "Too many messages. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    await ContactMessage.create(parsed.data);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  const access = await requirePermission("view_messages");
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const items = await ContactMessage.find().sort({ createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
