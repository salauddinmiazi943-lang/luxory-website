import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: z.string().min(10, "New password must be at least 10 characters").max(128),
});

export async function POST(request: Request) {
  const access = await requireUser();
  if ("error" in access) return access.error;
  if (!["super_admin", "admin", "vendor"].includes(access.user.role)) {
    return Response.json({ error: "Only admin and vendor accounts can change a password here." }, { status: 403 });
  }
  if (!rateLimit(clientKey(request, "change-password"), 8, 10 * 60_000)) {
    return Response.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();

    const user = await User.findById(access.user.id).select("passwordHash role");
    if (!user) return Response.json({ error: "Account not found" }, { status: 404 });

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) return Response.json({ error: "Current password is incorrect." }, { status: 400 });

    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return Response.json({ error: "New password must be different from the current password." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash }, $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "", passwordResetOtpHash: "", passwordResetOtpExpiresAt: "", passwordResetOtpAttempts: "" } },
    );

    return Response.json({ ok: true, message: "Password changed successfully." });
  } catch (error) {
    return apiError(error);
  }
}
