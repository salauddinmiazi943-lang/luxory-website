import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { mailConfigured, sendPasswordResetEmail } from "@/lib/mailer";
import {
  PASSWORD_RESET_OTP_TTL_MINUTES,
  PASSWORD_RESET_ROLES,
  PASSWORD_RESET_TTL_MINUTES,
  createPasswordResetOtp,
  createPasswordResetToken,
  passwordResetRoleLabel,
} from "@/lib/password-reset";

const schema = z.object({ email: z.string().trim().email().max(254) });

const genericMessage =
  "If this email belongs to a super admin, sub admin, or vendor account, a 6-digit reset code and reset link have been sent.";

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "forgot-password"), 5, 10 * 60_000)) {
    return Response.json({ error: "Too many reset requests. Please try again in a few minutes." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const user = await User.findOne({
      email: parsed.data.email.toLowerCase(),
      role: { $in: [...PASSWORD_RESET_ROLES] },
      status: "active",
    }).select("_id name email role");

    const consoleFallback = mailConfigured() ? {} : { fallback: "console" as const };
    if (!user) return Response.json({ ok: true, message: genericMessage, ...consoleFallback });

    const { token, hash } = createPasswordResetToken();
    const { otp, hash: otpHash } = createPasswordResetOtp();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);
    const otpExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MINUTES * 60_000);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: hash,
          passwordResetExpiresAt: expiresAt,
          passwordResetOtpHash: otpHash,
          passwordResetOtpExpiresAt: otpExpiresAt,
          passwordResetOtpAttempts: 0,
        },
      },
    );

    const configuredBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
    const origin = configuredBase || new URL(request.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    try {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        otp,
        expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
        otpExpiresMinutes: PASSWORD_RESET_OTP_TTL_MINUTES,
        roleLabel: passwordResetRoleLabel(user.role),
      });
      return Response.json({
        ok: true,
        message: genericMessage,
        ...(result.fallback ? { fallback: "console" as const } : {}),
      });
    } catch (mailError) {
      console.error("Password reset email could not be sent.", mailError);
      await User.updateOne(
        { _id: user._id },
        {
          $unset: {
            passwordResetTokenHash: "",
            passwordResetExpiresAt: "",
            passwordResetOtpHash: "",
            passwordResetOtpExpiresAt: "",
            passwordResetOtpAttempts: "",
          },
        },
      );
      return Response.json(
        { error: "Could not send the reset email right now. Please try again later." },
        { status: 502 },
      );
    }
  } catch (error) {
    return apiError(error);
  }
}
