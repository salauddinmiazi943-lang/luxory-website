"use client";

import { useState } from "react";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { useStore } from "@/components/store-context";

type AppType = "vendor" | "reseller" | "wholesaler";

export function BusinessApplicationForm({ fixedType }: { fixedType?: AppType } = {}) {
  const { t } = useStore();
  const [applicationType, setApplicationType] = useState<AppType>(fixedType ?? "reseller");
  const [documents, setDocuments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const type = fixedType ?? applicationType;

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length + documents.length > 8) { setError(t("uploadMaxDocuments")); return; }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) { setError(t("uploadMaxSize")); return; }
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
          applicationType: type,
          name: form.get("name"), shopName: form.get("shopName"), email: form.get("email"),
          phone: form.get("phone"), address: form.get("address"), description: form.get("description"),
          tradeLicense: form.get("tradeLicense") || "", documents,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not submit application");
      formElement.reset(); setDocuments([]);
      setSuccess(t("applicationSuccess") || "Application submitted. Our team will review it.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit application"); }
    finally { setBusy(false); }
  }

  return <form className="form-card" onSubmit={submit}>
    {error && <p className="form-error">{error}</p>}{success && <p className="form-success">{success}</p>}
    {!fixedType && <div className="field"><label htmlFor="applicationType">{t("applicationType")}</label><select id="applicationType" value={applicationType} onChange={(e) => setApplicationType(e.target.value as AppType)} required><option value="reseller">{t("reseller")}</option><option value="wholesaler">{t("wholesaler")}</option><option value="vendor">{t("vendorSeller")}</option></select></div>}
    <div className="form-grid"><div className="field"><label htmlFor="name">{t("yourName")}</label><input id="name" name="name" required minLength={2} maxLength={120} /></div><div className="field"><label htmlFor="shopName">{t("shopName")}</label><input id="shopName" name="shopName" required minLength={2} maxLength={120} /></div></div>
    <div className="form-grid"><div className="field"><label htmlFor="email">{t("emailAddressLabel")}</label><input id="email" name="email" type="email" required maxLength={254} /></div><div className="field"><label htmlFor="phone">{t("phoneNumber")}</label><input id="phone" name="phone" type="tel" required minLength={6} maxLength={30} /></div></div>
    <div className="field"><label htmlFor="tradeLicense">{t("tradeLicenseLabel")}</label><input id="tradeLicense" name="tradeLicense" maxLength={200} placeholder={t("tradeLicensePlaceholder")} /></div>
    <div className="field"><label htmlFor="address">{t("businessAddress")}</label><textarea id="address" name="address" required minLength={5} maxLength={1000} /></div>
    <div className="field"><label htmlFor="description">{t("shopDescription")}</label><textarea id="description" name="description" required minLength={10} maxLength={3000} /></div>
    <div className="field"><label htmlFor="documents">{t("businessDocuments")} ({t("tradeLicenseLabel")})</label><input id="documents" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple onChange={upload} />{uploading && <small className="subtle">{t("uploadingSecurely")}</small>}{documents.length > 0 && <small className="subtle">{documents.length} {t("documentsReady")}</small>}</div>
    <button className="button-primary" disabled={busy || uploading}>{busy ? t("submitting") : t("submitApplication")}</button>
  </form>;
}
