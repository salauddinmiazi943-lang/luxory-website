"use client";

import { useEffect, useState } from "react";

export function GuestDeliveryReport({ orderId }: { orderId: string }) {
  const [accessKey, setAccessKey] = useState("");
  const [reason, setReason] = useState("not_received");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(`delivery-access:${orderId}`) ?? "";
    const frame = window.requestAnimationFrame(() => setAccessKey(stored));
    return () => window.cancelAnimationFrame(frame);
  }, [orderId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery/guest-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey, requestId: crypto.randomUUID(), reason, details }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not report this delivery issue");
      setNotice(result.message || "Your delivery report was sent to our team.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not report this delivery issue");
    } finally {
      setBusy(false);
    }
  }

  if (!accessKey) return null;
  return <section className="guest-delivery-report" aria-labelledby="guest-delivery-heading">
    <h2 id="guest-delivery-heading">Delivery issue?</h2>
    <p>Your private order access key lets you contact us without creating an account. Keep it private.</p>
    <details><summary>View your private access key</summary><code>{accessKey}</code></details>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <form onSubmit={submit}>
      <label className="field">Issue type
        <select value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Delivery issue type">
          <option value="not_received">Order not received</option>
          <option value="late">Delivery is late</option>
          <option value="missing_items">Items are missing</option>
          <option value="damaged">Items arrived damaged</option>
          <option value="other">Other problem</option>
        </select>
      </label>
      <label className="field">Optional details
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} />
      </label>
      <button className="button-secondary" disabled={busy}>{busy ? "Sending…" : "Send delivery report"}</button>
    </form>
  </section>;
}
