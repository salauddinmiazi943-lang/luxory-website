"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setFallback(false);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string; fallback?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send the reset code.");
      setMessage(result.message || "If the email is registered, a verification code has been sent.");
      setFallback(result.fallback === "console");
      setSubmittedEmail(email.trim().toLowerCase());
    } catch (reason) {
      setError(reason instanceof Error && reason.name === "TimeoutError" ? "The server is taking too long to respond. Please try again in a moment." : reason instanceof Error ? reason.message : "Could not send the reset code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div style={{ maxWidth: 520, margin: "20px auto 40px" }}>
        <p className="breadcrumb"><Link href="/">Home</Link> / Forgot password</p>
        <h1 className="page-title">Forgot Password</h1>
        <p className="subtle" style={{ marginBottom: 18 }}>
          Enter the email address of your Super Admin, Sub Admin, or Vendor account. We will send a 6-digit
          verification code (valid for 15 minutes) and a secure reset link (valid for 30 minutes). If you request
          again, only the newest code stays valid.
        </p>
        <form className="form-card" onSubmit={submit}>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          {fallback && (
            <p className="form-success" role="status">
              SMTP is not configured on this server, so the verification code and reset link were printed in the
              server console for local testing.
            </p>
          )}
          {submittedEmail && (
            <p>
              <Link
                className="button-secondary"
                href={`/reset-password?email=${encodeURIComponent(submittedEmail)}`}
              >
                Enter 6-digit code
              </Link>
            </p>
          )}
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
          </div>
          <button className="button-primary" disabled={busy}>
            {busy ? "Sending…" : "Send verification code"}
          </button>
          <p className="subtle" style={{ marginTop: 12 }}>
            <Link href="/admin/login">Admin login</Link> · <Link href="/account">Vendor / account login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}


