import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User, VendorApplication } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";

const schema = z.object({ status: z.enum(["approved", "rejected"]) });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const access = await requirePermission("manage_vendors");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid application id" }, { status: 400 });
    await connectDb();
    const application = await VendorApplication.findById(id);
    if (!application) return Response.json({ error: "Application not found" }, { status: 404 });
    application.status = parsed.data.status;
    let temporaryPassword: string | undefined;
    if (parsed.data.status === "approved") {
      const targetRole = (application.applicationType === "reseller" || application.applicationType === "wholesaler") ? application.applicationType : "vendor";
      let user = await User.findOne({ email: application.email });
      if (user && !["customer", "vendor", "reseller", "wholesaler"].includes(user.role)) return Response.json({ error: "Email belongs to an administrator or restricted account" }, { status: 409 });
      if (user) {
        user.role = targetRole;
        user.status = "active";
        user.name = application.name;
        user.shopName = application.shopName;
        user.phone = application.phone;
        user.address = application.address;
      } else {
        temporaryPassword = randomBytes(15).toString("base64url");
        user = await User.create({
          name: application.name, shopName: application.shopName, email: application.email, role: targetRole, status: "active",
          passwordHash: await bcrypt.hash(temporaryPassword, 12), phone: application.phone, address: application.address,
        });
      }
      await user.save();
    }
    await application.save();
    return Response.json({ item: application, ...(temporaryPassword ? { temporaryPassword } : {}) });
  } catch (error) {
    return apiError(error);
  }
}
