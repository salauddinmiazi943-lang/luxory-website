import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import {
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  PASSWORD_RESET_ROLES,
  hashPasswordResetToken,
  passwordResetOtpMatches,
} from "@/lib/password-reset";

const passwordField = z.string().min(10, "Password must be at least 10 characters").max(128);

const schema = z.union([
  z.object({
    token: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Reset token is invalid"),
    password: passwordField,
  }),
  z.object({
    email: z.string().trim().email().max(254),
    otp: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => /^\d{6}$/.test(value), "Enter the 6-digit verification code"),
    password: passwordField,
  }),
]);

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "reset-password"), 8, 10 * 60_000)) {
    return Response.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();

    if ("token" in parsed.data) return await resetWithToken(parsed.data.token, parsed.data.password);
    return await resetWithOtp(parsed.data.email, parsed.data.otp, parsed.data.password);
  } catch (error) {
    return apiError(error);
  }
}

async function resetWithToken(token: string, password: string) {
  const user = await User.findOne({
    passwordResetTokenHash: hashPasswordResetToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
    role: { $in: [...PASSWORD_RESET_ROLES] },
  }).select("_id");

  if (!user) {
    return Response.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await User.updateOne(
    { _id: user._id, passwordResetTokenHash: hashPasswordResetToken(token) },
    {
      $set: { passwordHash },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetExpiresAt: "",
        passwordResetOtpHash: "",
        passwordResetOtpExpiresAt: "",
        passwordResetOtpAttempts: "",
      },
    },
  );
  if (!updated.modifiedCount) {
    return Response.json(
      { error: "This reset link has already been used. Please request a new one." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, message: "Your password has been updated. You can sign in now." });
}

async function resetWithOtp(email: string, otp: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    role: { $in: [...PASSWORD_RESET_ROLES] },
    status: "active",
  }).select("+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts");

  if (!user?.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    return Response.json(
      { error: "No active verification code was found for this email. Please request a new code.", code: "missing" },
      { status: 400 },
    );
  }
  if (user.passwordResetOtpExpiresAt.getTime() <= Date.now()) {
    await User.updateOne(
      { _id: user._id },
      { $unset: { passwordResetOtpHash: "", passwordResetOtpExpiresAt: "", passwordResetOtpAttempts: "" } },
    );
    return Response.json(
      { error: "This verification code has expired. Please request a new code.", code: "expired" },
      { status: 400 },
    );
  }
  const usedAttempts = user.passwordResetOtpAttempts ?? 0;
  if (usedAttempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    await User.updateOne(
      { _id: user._id },
      { $unset: { passwordResetOtpHash: "", passwordResetOtpExpiresAt: "", passwordResetOtpAttempts: "" } },
    );
    return Response.json(
      { error: "Too many incorrect attempts. Please request a new verification code.", code: "locked" },
      { status: 429 },
    );
  }
  if (!passwordResetOtpMatches(otp, user.passwordResetOtpHash)) {
    const nextAttempts = usedAttempts + 1;
    const remaining = Math.max(0, PASSWORD_RESET_OTP_MAX_ATTEMPTS - nextAttempts);
    if (remaining === 0) {
      await User.updateOne(
        { _id: user._id },
        { $unset: { passwordResetOtpHash: "", passwordResetOtpExpiresAt: "", passwordResetOtpAttempts: "" } },
      );
    } else {
      await User.updateOne(
        { _id: user._id, passwordResetOtpHash: user.passwordResetOtpHash },
        { $set: { passwordResetOtpAttempts: nextAttempts } },
      );
    }
    console.warn(`Password reset OTP mismatch for ${normalizedEmail}; remaining attempts: ${remaining}.`);
    return Response.json(
      {
        error: remaining > 0
          ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Please request a new verification code.",
        code: remaining > 0 ? "incorrect" : "locked",
        attemptsLeft: remaining,
      },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await User.updateOne(
    { _id: user._id, passwordResetOtpHash: user.passwordResetOtpHash },
    {
      $set: { passwordHash },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetExpiresAt: "",
        passwordResetOtpHash: "",
        passwordResetOtpExpiresAt: "",
        passwordResetOtpAttempts: "",
      },
    },
  );
  if (!updated.modifiedCount) {
    return Response.json({ error: "This code has already been used. Please request a new one." }, { status: 400 });
  }

  return Response.json({ ok: true, message: "Your password has been updated. You can sign in now." });
}
