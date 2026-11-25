"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resendCode() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter the email address of your account first.");
      return;
    }
    setResending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string; fallback?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send a new code.");
      setNotice("A new verification code has been sent. Only the newest code works.");
      setCooldown(60);
    } catch (reason) {
      setError(reason instanceof Error && reason.name === "TimeoutError" ? "The server is taking too long to respond. Please try again in a moment." : reason instanceof Error ? reason.message : "Could not send a new code.");
    } finally {
      setResending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (!token && !/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit verification code from your email.");
      return;
    }
    if (!token && !email.trim()) {
      setError("Enter the email address of your account.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          token ? { token, password } : { email: email.trim().toLowerCase(), otp: otp.trim(), password },
        ),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not reset the password.");
      setMessage(result.message || "Your password has been updated.");
      setPassword("");
      setConfirmPassword("");
      setOtp("");
    } catch (reason) {
      setError(reason instanceof Error && reason.name === "TimeoutError" ? "The server is taking too long to respond. Please try again in a moment." : reason instanceof Error ? reason.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div style={{ maxWidth: 520, margin: "20px auto 40px" }}>
        <p className="breadcrumb"><Link href="/">Home</Link> / Reset password</p>
        <h1 className="page-title">Set a New Password</h1>
        <p className="subtle" style={{ marginBottom: 18 }}>
          {token
            ? "Choose a new password of at least 10 characters. The reset link works only once."
            : "Enter the 6-digit verification code from your email and choose a new password of at least 10 characters. The code expires in 15 minutes and works only once."}
        </p>
        <form className="form-card" onSubmit={submit}>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          {!token && <>
            <div className="field">
              <label htmlFor="email">Registered email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                maxLength={254}
              />
              <small className="subtle">Use the email that received the code. If you requested several codes, only the newest one works.</small>
            </div>
            <div className="field">
              <label htmlFor="otp">6-digit verification code</label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                required
                maxLength={6}
                style={{ letterSpacing: 6, fontWeight: 700 }}
              />
              <small className="subtle">
                <button type="button" className="inline-button" onClick={() => void resendCode()} disabled={resending || cooldown > 0 || busy}>
                  {resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
              </small>
            </div>
          </>}
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
            <small className="subtle">Minimum 10 characters.</small>
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
          </div>
          <button className="button-primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
          <p className="subtle" style={{ marginTop: 12 }}>
            <Link href="/admin/login">Admin login</Link> · <Link href="/account">Vendor / account login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="page-shell">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

