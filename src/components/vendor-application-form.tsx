"use client";

import { useState } from "react";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { useStore } from "@/components/store-context";

export function VendorApplicationForm() {
  const { t } = useStore();
  const [documents, setDocuments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length + documents.length > 8) { setError("Upload up to 8 documents."); return; }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) { setError("Each document must be smaller than 10 MB."); return; }
    setError(""); setUploading(true);
    try {
      const urls = await Promise.all(files.map((file) => uploadToCloudinary(file, "vendor-document")));
      setDocuments((current) => [...current, ...urls]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); }
    finally { setUploading(false); event.target.value = ""; }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/vendor-applications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), shopName: form.get("shopName"), email: form.get("email"),
          phone: form.get("phone"), address: form.get("address"), description: form.get("description"), documents,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not submit application");
      formElement.reset(); setDocuments([]);
      setSuccess(t("applicationSuccess"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit application"); }
    finally { setBusy(false); }
  }
  return <form className="form-card" onSubmit={submit}>{error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}
    <div className="form-grid"><div className="field"><label htmlFor="name">{t("yourName")}</label><input id="name" name="name" required minLength={2} maxLength={120} /></div><div className="field"><label htmlFor="shopName">{t("shopName")}</label><input id="shopName" name="shopName" required minLength={2} maxLength={120} /></div></div>
    <div className="form-grid"><div className="field"><label htmlFor="email">{t("emailAddressLabel")}</label><input id="email" name="email" type="email" required maxLength={254} /></div><div className="field"><label htmlFor="phone">{t("phoneNumber")}</label><input id="phone" name="phone" type="tel" required minLength={6} maxLength={30} /></div></div>
    <div className="field"><label htmlFor="address">{t("businessAddress")}</label><textarea id="address" name="address" required minLength={5} maxLength={1000} /></div>
    <div className="field"><label htmlFor="description">{t("shopDescription")}</label><textarea id="description" name="description" required minLength={10} maxLength={3000} /></div>
    <div className="field"><label htmlFor="documents">{t("businessDocuments")}</label><input id="documents" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple onChange={upload} />{uploading && <small className="subtle">{t("uploadingSecurely")}</small>}{documents.length > 0 && <small className="subtle">{documents.length} {t("documentsReady")}</small>}</div>
    <button className="button-primary" disabled={busy || uploading}>{busy ? t("submitting") : t("submitApplication")}</button>
  </form>;
}
