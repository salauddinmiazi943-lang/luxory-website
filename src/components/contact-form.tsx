"use client";

import { useState } from "react";
import { useStore } from "@/components/store-context";

export function ContactForm() {
  const { t } = useStore();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), subject: form.get("subject"), message: form.get("message") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not send your message");
      formElement.reset();
      setMessage(t("contactSuccess"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send your message"); }
    finally { setBusy(false); }
  }
  return <form className="form-card" onSubmit={submit}>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
    <div className="field"><label htmlFor="name">{t("yourName")}</label><input id="name" name="name" required minLength={2} maxLength={120} /></div>
    <div className="field"><label htmlFor="email">{t("emailAddressLabel")}</label><input id="email" name="email" type="email" required maxLength={254} /></div>
    <div className="field"><label htmlFor="subject">{t("subject")}</label><input id="subject" name="subject" required minLength={2} maxLength={160} /></div>
    <div className="field"><label htmlFor="message">{t("message")}</label><textarea id="message" name="message" required minLength={10} maxLength={4000} /></div>
    <button className="button-primary" disabled={busy}>{busy ? t("sending") : t("sendMessage")}</button>
  </form>;
}
