import { createTransport, type Transporter } from "nodemailer";

type MailResult = { delivered: boolean; fallback: boolean };

const smtpHost = () => (process.env.SMTP_HOST ?? "").trim();
const smtpUser = () => (process.env.SMTP_USER ?? "").trim();
const smtpPass = () => (process.env.SMTP_PASS ?? "").trim();
const smtpPort = () => {
  const value = Number((process.env.SMTP_PORT ?? "").trim() || 587);
  return Number.isFinite(value) && value > 0 ? value : 587;
};
const smtpFrom = () => (process.env.SMTP_FROM ?? "").trim() || smtpUser();

export function mailConfigured() {
  return Boolean(smtpHost() && smtpUser() && smtpPass());
}

let transporter: Transporter | null = null;
function getTransporter() {
  if (!mailConfigured()) return null;
  if (!transporter) {
    const port = smtpPort();
    transporter = createTransport({
      host: smtpHost(),
      port,
      secure: port === 465,
      auth: { user: smtpUser(), pass: smtpPass() },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  otp: string;
  expiresMinutes: number;
  otpExpiresMinutes: number;
  roleLabel: string;
}): Promise<MailResult> {
  const to = input.to.trim();
  const name = input.name.trim() || "there";
  const minutes = input.expiresMinutes;
  const roleLabel = input.roleLabel;
  const otp = input.otp;
  const subject = `Your ${roleLabel} password reset code — Luxora Global Trade`;

  const text = [
    `Hello ${name},`,
    "",
    `A password reset was requested for your ${roleLabel} account at Luxora Global Trade.`,
    "",
    `Your 6-digit verification code is: ${otp}`,
    `The code is valid for ${input.otpExpiresMinutes} minutes and can be used only once.`,
    "",
    `You can also open this link to reset your password (valid for ${minutes} minutes):`,
    input.resetUrl,
    "",
    "If you did not request this, you can safely ignore this email. Your password will not change.",
    "",
    "Luxora Global Trade",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f4;font-family:Arial,Helvetica,sans-serif;color:#22312b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8e2;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#004d40;padding:20px 24px;color:#ffffff;">
                <strong style="font-size:18px;letter-spacing:.02em;">Luxora Global Trade</strong>
                <div style="color:#d9c08a;font-size:12px;margin-top:4px;">${escapeHtml(roleLabel)} account security</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;">Hello ${escapeHtml(name)},</p>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#3f4d46;">
                  We received a request to reset the password for your ${escapeHtml(roleLabel)} account.
                  Enter this 6-digit verification code on the reset page. The code expires in <strong>${input.otpExpiresMinutes} minutes</strong> and can be used only once.
                </p>
                <p style="margin:18px 0;text-align:center;">
                  <span style="display:inline-block;padding:14px 26px;border:1px dashed #b08d4f;border-radius:10px;background:#fbf8f0;color:#004d40;font-size:30px;font-weight:bold;letter-spacing:8px;">${escapeHtml(otp)}</span>
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#3f4d46;">
                  Prefer a link? You can also set a new password with this link, valid for <strong>${minutes} minutes</strong>:
                </p>
                <p style="margin:18px 0;text-align:center;">
                  <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:12px 22px;background:#004d40;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Reset my password</a>
                </p>
                <p style="margin:0 0 8px;font-size:12px;color:#6b7873;">If the button does not work, copy this link into your browser:</p>
                <p style="margin:0 0 16px;font-size:12px;word-break:break-all;color:#004d40;">${escapeHtml(input.resetUrl)}</p>
                <p style="margin:0;font-size:12px;line-height:1.7;color:#6b7873;">
                  If you did not request this change, no action is needed and your password stays the same.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#f8faf7;border-top:1px solid #e2e8e2;font-size:11px;color:#7a877f;">
                Sent by Luxora Global Trade. Please do not reply to this automated message.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const mailer = getTransporter();
  if (!mailer) {
    console.warn(
      `[mail] SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Password reset OTP for ${to}: ${otp} | reset link: ${input.resetUrl}`,
    );
    return { delivered: false, fallback: true };
  }

  await mailer.sendMail({ from: smtpFrom(), to, subject, text, html });
  return { delivered: true, fallback: false };
}
