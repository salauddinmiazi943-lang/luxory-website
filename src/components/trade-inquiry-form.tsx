"use client";

import { useState } from "react";
import { useStore } from "@/components/store-context";

export function TradeInquiryForm({ type }: { type: "reseller" | "wholesaler" }) {
  const { t } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const address = String(form.get("address") || "").trim();
    const productsNeeded = String(form.get("productsNeeded") || "").trim();
    const subject = type === "reseller" ? "Reseller product request" : "Wholesaler product request";
    const message = `Products needed:\n${productsNeeded}\n\nContact number: ${phone}\nEmail: ${email}\nAddress: ${address}`;
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, address, inquiryType: type, subject, message }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not send request");
      formElement.reset();
      setSuccess(t("requestSent"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send request");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <p className="subtle" style={{ marginBottom: 18 }}>{type === "reseller" ? t("resellerIntro") : t("wholesalerIntro")}</p>
    <form className="form-card" onSubmit={submit}>
      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}
      <div className="form-grid">
        <div className="field"><label htmlFor="name">{t("yourName")}</label><input id="name" name="name" required minLength={2} maxLength={120} /></div>
        <div className="field"><label htmlFor="phone">{t("phoneNumber")}</label><input id="phone" name="phone" type="tel" required minLength={6} maxLength={30} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="email">{t("emailAddressLabel")}</label><input id="email" name="email" type="email" required maxLength={254} /></div>
        <div className="field"><label htmlFor="address">{t("businessAddress") || "Address"}</label><input id="address" name="address" required minLength={3} maxLength={1000} /></div>
      </div>
      <div className="field"><label htmlFor="productsNeeded">{t("productsNeeded")}</label><textarea id="productsNeeded" name="productsNeeded" required minLength={5} maxLength={4000} rows={6} placeholder={t("productsNeededPlaceholder")} /></div>
      <button className="button-primary" disabled={busy}>{busy ? t("sending") : t("sendRequest")}</button>
    </form>
  </div>;
}
