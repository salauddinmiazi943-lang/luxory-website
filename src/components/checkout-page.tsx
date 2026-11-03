"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";

export function CheckoutPage() {
  const { cart, clearCart, locale, t } = useStore();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerInfo: { name: form.get("name"), phone: form.get("phone"), address: form.get("address"), notes: form.get("notes") },
          items: cart.map((line) => ({ productId: line.id, ...(line.variantId ? { variantId: line.variantId } : {}), quantity: line.quantity })), paymentMethod: "COD",
        }),
      });
      const result = await response.json() as { item?: { _id: string }; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Could not place your order");
      clearCart();
      router.push(`/order-confirmation/${encodeURIComponent(result.item._id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not place your order");
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p>{t("emptyCart")}</p><Link href="/products" className="button-primary">{t("continueShopping")}</Link></div>;
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　<Link href="/cart">{t("cart")}</Link>　/　{t("checkout")}</p><h1 className="page-title">{t("checkout")}</h1><div className="split-layout"><form className="form-card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>{t("deliveryDetails")}</h2>{error && <p className="form-error">{error}</p>}
      <div className="field"><label htmlFor="name">{t("fullName")} *</label><input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120} /></div>
      <div className="field"><label htmlFor="phone">{t("phoneNumber")} *</label><input id="phone" name="phone" type="tel" autoComplete="tel" required minLength={6} maxLength={30} /></div>
      <div className="field"><label htmlFor="address">{t("deliveryAddress")} *</label><textarea id="address" name="address" autoComplete="street-address" required minLength={5} maxLength={1000} /></div>
      <div className="field"><label htmlFor="notes">{t("orderNotes")}</label><textarea id="notes" name="notes" maxLength={2000} /></div>
      <div className="field"><label>{t("paymentMethod")}</label><div className="subtle">Cash on delivery (COD)</div></div>
      <button className="button-primary" disabled={busy}>{busy ? t("placingOrder") : `${t("placeOrder")} · ৳${total.toLocaleString("en-BD")}`}</button>
    </form><div className="dashboard-card"><h2>{t("orderSummary")}</h2>{cart.map((line) => <p key={`${line.id}:${line.variantId ?? ""}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, gap: 12 }}><span>{line.name}{line.variantLabel ? ` (${line.variantLabel})` : ""} × {line.quantity.toLocaleString("en-BD")} {unitLabel(line.unit, locale)} · ৳{line.price.toLocaleString("en-BD")} each</span><strong>৳{(line.price * line.quantity).toLocaleString("en-BD")}</strong></p>)}<hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "20px 0" }} /><strong style={{ display: "flex", justifyContent: "space-between" }}><span>{t("total")}</span><span>৳{total.toLocaleString("en-BD")}</span></strong></div></div></div>;
}
