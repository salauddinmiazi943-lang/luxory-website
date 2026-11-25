"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore, type CartLine } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";
import { formatBdt } from "@/lib/pricing";

type SavedAddress = { _id?: string; label?: string; name: string; phone: string; address: string; isDefault: boolean };
type AddressFields = { name: string; phone: string; address: string; notes: string };
type CoinConfigResponse = {
  wallet?: { balanceCoins?: number };
  settings?: { coinRedemption?: { minimumRedeemCoins?: number; coinsPer1Taka?: number; maxRedeemPercentPerOrder?: number } };
  canRedeem?: boolean;
};
type PaymentMethodItem = { method: "COD" | "BKASH" | "NAGAD" | "ROCKET" | "BANK"; label: string; enabled: boolean; accountNumber: string; accountName: string; instructions: string };
type DeliveryConfig = { deliveryChargeEnabled: boolean; insideDhakaCharge: number; outsideDhakaCharge: number; freeDeliveryEnabled: boolean; freeDeliveryThreshold: number };

export function CheckoutPage() {
  const { cart, clearCart, locale, t } = useStore();
  const [error, setError] = useState("");
  const [tradeBlocked, setTradeBlocked] = useState<"reseller" | "wholesaler" | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [savedAddressId, setSavedAddressId] = useState("");
  const [customerSignedIn, setCustomerSignedIn] = useState(false);
  const [loadedDirectCheckout, setLoadedDirectCheckout] = useState<{ key: string; item?: CartLine; error?: string } | null>(null);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>({ deliveryChargeEnabled: true, insideDhakaCharge: 60, outsideDhakaCharge: 120, freeDeliveryEnabled: false, freeDeliveryThreshold: 5000 });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(true);
  const [paymentConfigError, setPaymentConfigError] = useState("");
  const [coinConfig, setCoinConfig] = useState<{ balanceCoins: number; minimumRedeemCoins: number; coinsPer1Taka: number; maxRedeemPercentPerOrder: number; canRedeem: boolean } | null>(null);
  const [redeemCoins, setRedeemCoins] = useState(0);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [voucherStatus, setVoucherStatus] = useState<"" | "checking" | "valid" | "error">("");
  const [voucherMessage, setVoucherMessage] = useState("");
  const [addressFields, setAddressFields] = useState<AddressFields>({ name: "", phone: "", address: "", notes: "" });
  const [deliveryArea, setDeliveryArea] = useState<"inside_dhaka" | "outside_dhaka">("inside_dhaka");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "BKASH" | "NAGAD" | "ROCKET" | "BANK">("COD");
  const [paymentSenderNumber, setPaymentSenderNumber] = useState("");
  const [paymentSenderAccountInfo, setPaymentSenderAccountInfo] = useState("");
  const [paymentTransactionId, setPaymentTransactionId] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const buyNowProductId = searchParams.get("buyNow");
  const buyNowVariantId = searchParams.get("variantId");
  const buyNowQuantity = searchParams.get("quantity") || "1";
  const buyNowKey = `${buyNowProductId ?? ""}:${buyNowVariantId ?? ""}:${buyNowQuantity}`;
  const directCheckout = buyNowProductId && loadedDirectCheckout?.key === buyNowKey ? loadedDirectCheckout : null;

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me").then((r) => r.json() as Promise<{ user?: { role?: string } | null }>).then((d) => {
      if (!active) return;
      if (d.user?.role === "reseller") setTradeBlocked("reseller");
      else if (d.user?.role === "wholesaler") setTradeBlocked("wholesaler");
    }).catch(() => {});
    fetch("/api/checkout/coin-config").then((r) => r.ok ? r.json() as Promise<CoinConfigResponse> : null).then((d) => {
      const cr = d?.settings?.coinRedemption;
      if (cr) setCoinConfig({ balanceCoins: Number(d?.wallet?.balanceCoins ?? 0), minimumRedeemCoins: Number(cr.minimumRedeemCoins ?? 0), coinsPer1Taka: Number(cr.coinsPer1Taka ?? 0), maxRedeemPercentPerOrder: Number(cr.maxRedeemPercentPerOrder ?? 0), canRedeem: Boolean(d?.canRedeem) });
    }).catch(() => {});
    fetch("/api/checkout/config").then(async (response) => {
      const data = await response.json() as { delivery?: DeliveryConfig; paymentMethods?: PaymentMethodItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load checkout settings.");
      return data;
    }).then((d) => {
      if (!active) return;
      if (d.delivery) setDeliveryConfig(d.delivery);
      if (Array.isArray(d.paymentMethods)) setPaymentMethods(d.paymentMethods);
    }).catch((reason: unknown) => {
      if (active) setPaymentConfigError(reason instanceof Error ? reason.message : "Could not load payment options.");
    }).finally(() => {
      if (active) setPaymentConfigLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/customer/addresses", { signal: AbortSignal.timeout(15_000) });
        if (response.status === 401 || response.status === 403) return;
        const result = await response.json() as { addresses?: SavedAddress[] };
        if (!response.ok || !result.addresses || !active) return;
        setCustomerSignedIn(true);
        setSavedAddresses(result.addresses);
        const def = result.addresses.find((a) => a.isDefault) ?? result.addresses[0];
        if (def) {
          setSavedAddressId(def._id ?? "");
          setAddressFields((c) => ({ ...c, name: def.name || "", phone: def.phone || "", address: def.address || "" }));
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!buyNowProductId) return;
    const productId = buyNowProductId;
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { signal: AbortSignal.timeout(15_000) });
        const result = await response.json() as { item?: { _id: string; slug: string; title: { en: string; bn?: string }; images?: string[]; price: number; discountPrice?: number; stock?: number; unit?: string; variants?: { _id?: string; label: string; price: number; stock: number; images?: string[] }[] }; error?: string };
        if (!response.ok || !result.item) throw new Error(result.error || t("couldNotLoadProduct"));
        const product = result.item;
        const variant = buyNowVariantId ? product.variants?.find((option) => option._id === buyNowVariantId) : undefined;
        if (buyNowVariantId && !variant) throw new Error(t("selectedOptionUnavailable"));
        if (!buyNowVariantId && product.variants?.length) throw new Error(t("selectProductOption"));
        const quantity = Number(buyNowQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > (variant?.stock ?? product.stock ?? 0)) throw new Error(t("selectedQuantityUnavailable"));
        const item: CartLine = { id: product._id, slug: product.slug, name: product.title[locale] || product.title.en, image: variant?.images?.[0] ?? product.images?.[0] ?? "", price: variant?.price ?? product.discountPrice ?? product.price, quantity, unit: product.unit ?? "piece", ...(variant?._id ? { variantId: variant._id, variantLabel: variant.label, variantImage: variant.images?.[0] } : {}) };
        if (active) setLoadedDirectCheckout({ key: buyNowKey, item });
      } catch (reason) {
        if (active) setLoadedDirectCheckout({ key: buyNowKey, error: reason instanceof Error ? reason.message : t("couldNotLoadProduct") });
      }
    })();
    return () => { active = false; };
  }, [buyNowProductId, buyNowVariantId, buyNowQuantity, buyNowKey, locale, t]);

  const directCheckoutLoading = Boolean(buyNowProductId && !directCheckout);
  const checkoutItems = directCheckout?.item ? [directCheckout.item] : buyNowProductId ? [] : cart;
  const subtotal = checkoutItems.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryCharge = useMemo(() => {
    if (!deliveryConfig.deliveryChargeEnabled) return 0;
    if (deliveryConfig.freeDeliveryEnabled && subtotal >= deliveryConfig.freeDeliveryThreshold) return 0;
    return deliveryArea === "inside_dhaka" ? deliveryConfig.insideDhakaCharge : deliveryConfig.outsideDhakaCharge;
  }, [deliveryArea, deliveryConfig, subtotal]);

  const maxRedeemByPercent = coinConfig?.canRedeem ? Math.floor(((subtotal + deliveryCharge) * (coinConfig.maxRedeemPercentPerOrder / 100)) * coinConfig.coinsPer1Taka) : 0;
  const effectiveRedeemCoins = coinConfig?.canRedeem ? Math.min(Math.max(0, Math.floor(redeemCoins)), coinConfig.balanceCoins, maxRedeemByPercent) : 0;
  const coinDiscount = coinConfig?.canRedeem && coinConfig.coinsPer1Taka > 0 ? Number((effectiveRedeemCoins / coinConfig.coinsPer1Taka).toFixed(2)) : 0;
  const effectiveVoucherDiscount = voucherStatus === "valid" ? Math.min(voucherDiscount, Math.max(0, subtotal + deliveryCharge - coinDiscount)) : 0;
  const total = Math.max(0, subtotal + deliveryCharge - coinDiscount - effectiveVoucherDiscount);

  const enabledMethods = paymentMethods.filter((m) => m.enabled !== false);
  const activeMethod = enabledMethods.find((m) => m.method === paymentMethod) ?? enabledMethods[0];
  const selectedPayment = activeMethod?.method ?? "";

  async function applyVoucher() {
    const code = voucherCode.trim();
    if (!code) return;
    setVoucherStatus("checking"); setVoucherMessage(""); setVoucherDiscount(0);
    try {
      const res = await fetch("/api/checkout/voucher-validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voucherCode: code, payableAmount: Math.max(0, subtotal + deliveryCharge - coinDiscount) }) });
      const data = await res.json() as { ok?: boolean; error?: string; voucher?: { discountBdt: number } };
      if (!res.ok || !data.ok || !data.voucher) { setVoucherStatus("error"); setVoucherDiscount(0); setVoucherMessage(data.error || "Voucher could not be applied."); }
      else { setVoucherStatus("valid"); setVoucherDiscount(Number(data.voucher.discountBdt || 0)); setVoucherMessage(`Voucher applied: -${formatBdt(Number(data.voucher.discountBdt || 0))}`); }
    } catch { setVoucherStatus("error"); setVoucherDiscount(0); setVoucherMessage("Voucher could not be applied."); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payMethod = selectedPayment;
    if (!payMethod) throw new Error("No payment method is currently available.");
      if (payMethod !== "COD") {
        const trx = paymentTransactionId.trim();
        if (!/^[0-9A-Za-z]{6,20}$/.test(trx)) throw new Error("Enter a valid Transaction/Reference ID (6-20 chars).");
        if (payMethod === "BANK") {
          if ((paymentSenderAccountInfo || paymentSenderNumber).trim().length < 3) throw new Error("Enter sender bank account info.");
        } else {
          if (!/^01[0-9]{9}$/.test(paymentSenderNumber.trim())) throw new Error("Enter a valid 11-digit sender number.");
        }
      }
      const areaLabel = deliveryArea === "inside_dhaka" ? "Inside Dhaka" : "Outside Dhaka";
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(effectiveRedeemCoins > 0 ? { redeemCoins: effectiveRedeemCoins } : {}),
          ...(voucherStatus === "valid" && voucherCode.trim() ? { voucherCode: voucherCode.trim().toUpperCase() } : {}),
          deliveryArea,
          customerInfo: {
            name: addressFields.name,
            phone: addressFields.phone,
            division: deliveryArea === "inside_dhaka" ? "Dhaka" : "",
            district: "",
            upazila: "",
            area: areaLabel,
            address: addressFields.address,
            notes: addressFields.notes,
          },
          items: checkoutItems.map((line) => ({ productId: line.id, ...(line.variantId ? { variantId: line.variantId } : {}), quantity: line.quantity })),
          paymentMethod: payMethod,
          ...(payMethod !== "COD" ? { paymentTransactionId: paymentTransactionId.trim().toUpperCase(), paymentSenderNumber: paymentSenderNumber.trim(), paymentSenderAccountInfo: paymentSenderAccountInfo.trim() } : {}),
        }),
      });
      let result: { item?: { _id: string }; deliveryAccessKey?: string; error?: string } = {};
      try { const text = await response.text(); result = text ? (JSON.parse(text) as typeof result) : {}; } catch { result = {}; }
      if (!response.ok || !result.item) throw new Error(result.error || "Could not place your order");
      if (!buyNowProductId) clearCart();
      if (result.deliveryAccessKey) {
        try { window.sessionStorage.setItem(`delivery-access:${result.item._id}`, result.deliveryAccessKey); }
        catch { window.prompt(t("saveDeliveryKeyPrompt"), result.deliveryAccessKey); }
      }
      router.push(`/order-confirmation/${encodeURIComponent(result.item._id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not place your order");
    } finally { setBusy(false); }
  }

  if (tradeBlocked) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><div className="form-card"><p className="form-error" role="alert">রিসেলার/হোলসেল ক্রেতা হিসেবে আপনি সাধারণ চেকআউট (Checkout) ব্যবহার করতে পারবেন না। অনুগ্রহ করে অর্ডার অনুরোধ (Order Request) পাঠান।</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="button-primary" href={tradeBlocked === "reseller" ? "/reseller-center" : "/wholesale-center"}>{tradeBlocked === "reseller" ? "Reseller Center" : "Wholesale Center"}</Link><Link className="button-secondary" href="/products">{t("continueShopping")}</Link></div></div></div>;
  if (directCheckoutLoading) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p>{t("loading")}</p></div>;
  if (directCheckout?.error) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p className="form-error" role="alert">{directCheckout.error}</p><Link href="/products" className="button-primary">{t("continueShopping")}</Link></div>;
  if (!checkoutItems.length) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p>{t("emptyCart")}</p><Link href="/products" className="button-primary">{t("continueShopping")}</Link></div>;

  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link> / <Link href="/cart">{t("cart")}</Link> / {t("checkout")}</p><h1 className="page-title">{t("checkout")}</h1>
    <div className="checkout-layout">
      <form className="form-card checkout-form" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>{t("deliveryDetails")}</h2>
        {error && <p className="form-error">{error}</p>}
        {customerSignedIn && savedAddresses.length > 0 && <div className="field"><label htmlFor="savedAddress">{t("savedAddresses")}</label><select id="savedAddress" value={savedAddressId} onChange={(e) => { const a = savedAddresses.find((x) => x._id === e.target.value); setSavedAddressId(e.target.value); if (a) setAddressFields((c) => ({ ...c, name: a.name, phone: a.phone, address: a.address })); }}><option value="">{t("newDeliveryAddress")}</option>{savedAddresses.map((a, i) => <option key={a._id ?? i} value={a._id ?? ""}>{a.label || a.name}</option>)}</select></div>}
        <div className="field"><label htmlFor="name">পুরো নাম (Full Name) *</label><input id="name" name="name" autoComplete="name" value={addressFields.name} onChange={(e) => setAddressFields((c) => ({ ...c, name: e.target.value }))} required minLength={2} maxLength={120} /></div>
        <div className="field"><label htmlFor="phone">ফোন নম্বর (Phone Number) *</label><input id="phone" name="phone" type="tel" autoComplete="tel" value={addressFields.phone} onChange={(e) => setAddressFields((c) => ({ ...c, phone: e.target.value }))} required minLength={6} maxLength={30} /></div>
        <div className="field"><label htmlFor="deliveryArea">ডেলিভারি এলাকা (Delivery Area) *</label><select id="deliveryArea" value={deliveryArea} onChange={(e) => setDeliveryArea(e.target.value as "inside_dhaka" | "outside_dhaka")} required><option value="inside_dhaka">ঢাকার ভেতরে (Inside Dhaka)</option><option value="outside_dhaka">ঢাকার বাইরে (Outside Dhaka)</option></select><small className="subtle">{deliveryConfig.deliveryChargeEnabled ? `এলাকা অনুযায়ী ডেলিভারি চার্জ হবে।${deliveryConfig.freeDeliveryEnabled ? ` ${formatBdt(deliveryConfig.freeDeliveryThreshold)} বা তার বেশি অর্ডারে অতিরিক্ত ফ্রি ডেলিভারি প্রযোজ্য।` : ""}` : "সব অর্ডারে ফ্রি ডেলিভারি চালু আছে।"}</small></div>
        <div className="field"><label htmlFor="address">সম্পূর্ণ ঠিকানা (Full Address) *</label><textarea id="address" name="address" autoComplete="street-address" value={addressFields.address} onChange={(e) => setAddressFields((c) => ({ ...c, address: e.target.value }))} required minLength={5} maxLength={500} placeholder="বাসা/হোল্ডিং, রোড, এলাকা, থানা/জেলা" /></div>
        <div className="field"><label htmlFor="notes">অর্ডার নোট (Order Note) — ঐচ্ছিক</label><textarea id="notes" name="notes" value={addressFields.notes} onChange={(e) => setAddressFields((c) => ({ ...c, notes: e.target.value }))} maxLength={2000} placeholder="ডেলিভারি সম্পর্কিত বিশেষ নির্দেশনা থাকলে লিখুন" /></div>

        <fieldset className="checkout-payment-options">
          <legend>{t("paymentMethod")} / পেমেন্ট পদ্ধতি</legend>
          {paymentConfigLoading ? <p className="subtle">পেমেন্ট পদ্ধতি লোড হচ্ছে…</p> : paymentConfigError ? <p className="form-error" role="alert">{paymentConfigError}</p> : enabledMethods.length === 0 ? <p className="form-error" role="alert">এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি চালু নেই। অনুগ্রহ করে দোকানের সঙ্গে যোগাযোগ করুন।</p> : <>
            {enabledMethods.map((m) => <label key={m.method}><input type="radio" name="payment" value={m.method} checked={selectedPayment === m.method} onChange={() => setPaymentMethod(m.method)} /> {m.label || m.method}</label>)}
            {selectedPayment === "COD" ? <p className="subtle">পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন (Cash on Delivery)।</p> : selectedPayment ? <div className="stack" style={{ marginTop: 8 }}>
              <div className="subtle" style={{ display: "grid", gap: 4 }}>
                <p style={{ margin: 0 }}><strong>{activeMethod?.label || selectedPayment}</strong> পেমেন্ট নির্দেশনা:</p>
                {activeMethod?.accountName ? <p style={{ margin: 0 }}>Account/Merchant: <strong>{activeMethod.accountName}</strong></p> : null}
                {activeMethod?.accountNumber ? <p style={{ margin: 0 }}>Account Number: <strong>{activeMethod.accountNumber}</strong></p> : <p style={{ margin: 0 }}>Account Number: অ্যাডমিন প্যানেল থেকে সেট করা হলে এখানে দেখানো হবে।</p>}
                <p style={{ margin: 0 }}>{activeMethod?.instructions || "পেমেন্ট করে নিচের তথ্য দিন।"} মোট পরিশোধযোগ্য: <strong>{formatBdt(total)}</strong></p>
              </div>
              {selectedPayment === "BANK" ? <div className="field"><label htmlFor="senderInfo">Sender Bank Account Info *</label><input id="senderInfo" value={paymentSenderAccountInfo} onChange={(e) => setPaymentSenderAccountInfo(e.target.value)} maxLength={200} placeholder="Account name / number / bank" required /></div> : <div className="field"><label htmlFor="sender">Sender Number *</label><input id="sender" inputMode="numeric" value={paymentSenderNumber} onChange={(e) => setPaymentSenderNumber(e.target.value.replace(/\D/g, ""))} maxLength={11} placeholder="01XXXXXXXXX" required /></div>}
              <div className="field"><label htmlFor="trx">Transaction / Reference ID *</label><input id="trx" value={paymentTransactionId} onChange={(e) => setPaymentTransactionId(e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. 9AB7C8D9E0" required /></div>
            </div> : null}
          </>}
        </fieldset>
        <button className="button-primary" disabled={busy || paymentConfigLoading || Boolean(paymentConfigError) || enabledMethods.length === 0}>{busy ? t("placingOrder") : `${t("placeOrder")} · ${formatBdt(total)}`}</button>
      </form>

      <aside className="dashboard-card checkout-summary">
        <h2>{t("orderSummary")}</h2>
        {checkoutItems.map((line) => <div key={`${line.id}:${line.variantId ?? ""}`} style={{ display: "grid", gap: 2, fontSize: 12, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>{line.name}{line.variantLabel ? ` (${line.variantLabel})` : ""}</span><strong>{formatBdt(line.price * line.quantity)}</strong></div><div className="subtle">Qty: {line.quantity.toLocaleString("en-BD")} {unitLabel(line.unit, locale)} · {formatBdt(line.price)} each</div></div>)}
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />
        <p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px" }}><span>Product total</span><span>{formatBdt(subtotal)}</span></p>
        <p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px" }}><span>Delivery charge ({deliveryArea === "inside_dhaka" ? "Inside Dhaka" : "Outside Dhaka"})</span><span>{deliveryCharge === 0 ? "৳0 (Free)" : formatBdt(deliveryCharge)}</span></p>
        {coinDiscount > 0 && <p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px", color: "#166534" }}><span>Coin discount</span><span>-{formatBdt(coinDiscount)}</span></p>}
        {effectiveVoucherDiscount > 0 && <p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px", color: "#166534" }}><span>Voucher discount</span><span>-{formatBdt(effectiveVoucherDiscount)}</span></p>}
        <strong style={{ display: "flex", justifyContent: "space-between" }}><span>Final payable</span><span>{formatBdt(total)}</span></strong>
        {coinConfig?.canRedeem && coinConfig.balanceCoins >= coinConfig.minimumRedeemCoins && <div className="field" style={{ marginTop: 10 }}><label htmlFor="redeemCoins">Redeem coins (balance {coinConfig.balanceCoins})</label><input id="redeemCoins" type="number" min={0} max={coinConfig.balanceCoins} step={1} value={effectiveRedeemCoins} onChange={(e) => { setRedeemCoins(Math.max(0, Math.floor(Number(e.target.value || 0)))); setVoucherStatus(""); setVoucherDiscount(0); setVoucherMessage(""); }} /><small className="subtle">Min {coinConfig.minimumRedeemCoins}, {coinConfig.coinsPer1Taka} coin = ৳1, max {coinConfig.maxRedeemPercentPerOrder}%.</small></div>}
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="voucherCode">Reward voucher code</label><div style={{ display: "flex", gap: 8 }}><input id="voucherCode" value={voucherCode} onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherStatus(""); setVoucherDiscount(0); setVoucherMessage(""); }} placeholder="LGT-XXXX" maxLength={40} /><button type="button" className="button-secondary" disabled={voucherStatus === "checking" || !voucherCode.trim()} onClick={applyVoucher}>Apply</button></div>{voucherMessage && <small className={voucherStatus === "error" ? "form-error" : "subtle"}>{voucherMessage}</small>}</div>
      </aside>
    </div>
  </div>;
}
