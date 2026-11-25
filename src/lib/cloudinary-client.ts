export async function uploadToCloudinary(file: File, purpose?: "vendor-document" | "product-review") {
  const signatureRequest = await fetch("/api/upload/signature", {
    method: "POST",
    body: (() => { const data = new FormData(); if (purpose) data.set("purpose", purpose); return data; })(),
  });
  const signature = await signatureRequest.json() as { cloudName?: string; apiKey?: string; timestamp?: number; folder?: string; signature?: string; allowedFormats?: string; error?: string };
  if (!signatureRequest.ok || !signature.cloudName || !signature.apiKey || !signature.signature || !signature.timestamp || !signature.folder || !signature.allowedFormats) {
    throw new Error(signature.error || "Could not start image upload");
  }
  const body = new FormData();
  body.set("file", file);
  body.set("api_key", signature.apiKey);
  body.set("timestamp", String(signature.timestamp));
  body.set("folder", signature.folder);
  body.set("allowed_formats", signature.allowedFormats);
  body.set("signature", signature.signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, { method: "POST", body });
  const result = await response.json() as { secure_url?: string; error?: { message?: string } };
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Image upload failed");
  return result.secure_url;
}
