import { z } from "zod";
import { connectDb } from "@/lib/db";
import { ContactMessage } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const patchSchema = z.object({ read: z.boolean() });
type Context = { params: Promise<{ id: string }> };

function isObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("view_messages");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, patchSchema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!isObjectId(id)) return Response.json({ error: "Invalid message id" }, { status: 400 });
    await connectDb();
    const item = await ContactMessage.findByIdAndUpdate(id, { $set: { read: parsed.data.read } }, { new: true }).lean();
    if (!item) return Response.json({ error: "Message not found" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requirePermission("view_messages");
  if ("error" in access) return access.error;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return Response.json({ error: "Invalid message id" }, { status: 400 });
    await connectDb();
    const item = await ContactMessage.findByIdAndDelete(id).select("_id").lean();
    if (!item) return Response.json({ error: "Message not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}