"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore, type CartLine } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";
import { formatBdt } from "@/lib/pricing";

type LocationOption = { id: string; name: string; bnName: string };
type CheckoutLocations = {
  divisions: LocationOption[];
  districts: (LocationOption & { divisionId: string })[];
  upazilas: (LocationOption & { districtId: string; type: "upazila" | "thana" })[];
};
type SavedAddress = {
  _id?: string;
  label?: string;
  name: string;
  phone: string;
  division?: string;
  divisionBn?: string;
  district?: string;
  districtBn?: string;
  upazilaBn?: string;
  unionBn?: string;
  divisionId: string;
  districtId: string;
  upazilaId?: string;
  upazila?: string;
  unionId?: string;
  union?: string;
  area?: string;
  address: string;
  isDefault: boolean;
};
type AddressFields = { name: string; phone: string; area: string; address: string; label: string };

export function CheckoutPage() {
  const { cart, clearCart, locale, t } = useStore();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<CheckoutLocations | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [locationRetry, setLocationRetry] = useState(0);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState("");
  const [selectedUpazilaId, setSelectedUpazilaId] = useState("");
  const [manualUpazila, setManualUpazila] = useState("");
  const [manualUpazilaSelected, setManualUpazilaSelected] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [savedAddressId, setSavedAddressId] = useState("");
  const [customerSignedIn, setCustomerSignedIn] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [savedAddressError, setSavedAddressError] = useState(false);
  const [addressFields, setAddressFields] = useState<AddressFields>({
    name: "", phone: "", area: "", address: "", label: "",
  });
  const [loadedDirectCheckout, setLoadedDirectCheckout] = useState<{ key: string; item?: CartLine; error?: string } | null>(null);
  const [defaultDeliveryCharge, setDefaultDeliveryCharge] = useState(60);
  const router = useRouter();
  const searchParams = useSearchParams();
  const buyNowProductId = searchParams.get("buyNow");
  const buyNowVariantId = searchParams.get("variantId");
  const buyNowQuantity = searchParams.get("quantity") || "1";
  const buyNowKey = `${buyNowProductId ?? ""}:${buyNowVariantId ?? ""}:${buyNowQuantity}`;
  const directCheckout = buyNowProductId && loadedDirectCheckout?.key === buyNowKey ? loadedDirectCheckout : null;

  useEffect(() => {
    let active = true;
    async function loadLocations() {
      try {
        const response = await fetch("/api/locations", { signal: AbortSignal.timeout(15_000) });
        const result = await response.json() as {
          divisions?: { id: string; name: string; bnName: string }[];
          districts?: { id: string; divisionId: string; name: string; bnName: string }[];
          upazilas?: { id: string; districtId: string; name: string; bnName: string }[];
          error?: string;
        };
        if (!response.ok || !result.divisions || !result.districts || !result.upazilas) {
          throw new Error(result.error || t("locationLoadFailed"));
        }
        if (active) {
          setLocations(result as CheckoutLocations);
          setLocationError(false);
        }
      } catch {
        if (active) setLocationError(true);
      }
    }
    void loadLocations();
    fetch("/api/checkout/config").then((r) => r.ok ? r.json() : null).then((d: { defaultDeliveryCharge?: number } | null) => {
      if (active && d && Number.isFinite(d.defaultDeliveryCharge) && (d.defaultDeliveryCharge ?? -1) >= 0) setDefaultDeliveryCharge(Number(d.defaultDeliveryCharge));
    }).catch(() => {});
    return () => { active = false; };
  }, [locationRetry, t]);

  // ডিসট্রিক্ট চেঞ্জ হলে উপজেলা/থানা সম্পূর্ণ রিসেট করুন
  useEffect(() => {
    setSelectedUpazilaId("");
    setManualUpazila("");
    setManualUpazilaSelected(false);
  }, [selectedDistrictId]);

  useEffect(() => {
    let active = true;
    async function loadSavedAddresses() {
      try {
        const response = await fetch("/api/customer/addresses", { signal: AbortSignal.timeout(15_000) });
        if (response.status === 401 || response.status === 403) return;
        const result = await response.json() as { addresses?: SavedAddress[]; error?: string };
        if (!response.ok || !result.addresses) throw new Error(result.error || "Could not load saved addresses.");
        if (!active) return;
        setCustomerSignedIn(true);
        setSavedAddresses(result.addresses);
        const defaultAddress = result.addresses.find((address) => address.isDefault) ?? result.addresses[0];
        if (defaultAddress) {
          setSavedAddressId(defaultAddress._id ?? "");
          setAddressFields({
            name: defaultAddress.name,
            phone: defaultAddress.phone,
            area: [defaultAddress.union, defaultAddress.area].filter(Boolean).join(", "),
            address: defaultAddress.address,
            label: defaultAddress.label ?? "",
          });
          setSelectedDivisionId(defaultAddress.divisionId);
          setSelectedDistrictId(defaultAddress.districtId);
          setSelectedUpazilaId(defaultAddress.upazilaId ?? "");
          setManualUpazila(defaultAddress.upazilaId ? "" : defaultAddress.upazila ?? "");
          setManualUpazilaSelected(!defaultAddress.upazilaId);
        }
      } catch (reason) {
        console.error("Could not load saved customer addresses.", reason);
        if (active) setSavedAddressError(true);
      }
    }
    void loadSavedAddresses();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!buyNowProductId) return;

    const productId = buyNowProductId;
    let active = true;
    async function loadBuyNowItem() {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, { signal: AbortSignal.timeout(15_000) });
        const result = await response.json() as {
          item?: {
            _id: string; slug: string; title: { en: string; bn?: string }; images?: string[];
            price: number; discountPrice?: number; stock?: number; unit?: string;
            variants?: { _id?: string; label: string; price: number; stock: number }[];
          };
          error?: string;
        };
        if (!response.ok || !result.item) throw new Error(result.error || t("couldNotLoadProduct"));
        const product = result.item;
        const variant = buyNowVariantId ? product.variants?.find((option) => option._id === buyNowVariantId) : undefined;
        if (buyNowVariantId && !variant) throw new Error(t("selectedOptionUnavailable"));
        if (!buyNowVariantId && product.variants?.length) throw new Error(t("selectProductOption"));
        const quantity = Number(buyNowQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > (variant?.stock ?? product.stock ?? 0)) {
          throw new Error(t("selectedQuantityUnavailable"));
        }
        const item: CartLine = {
          id: product._id,
          slug: product.slug,
          name: product.title[locale] || product.title.en,
          image: product.images?.[0] ?? "",
          price: variant?.price ?? product.discountPrice ?? product.price,
          quantity,
          unit: product.unit ?? "piece",
          ...(variant?._id ? { variantId: variant._id, variantLabel: variant.label } : {}),
        };
        if (active) setLoadedDirectCheckout({ key: buyNowKey, item });
      } catch (reason) {
        if (active) setLoadedDirectCheckout({ key: buyNowKey, error: reason instanceof Error ? reason.message : t("couldNotLoadProduct") });
      }
    }
    void loadBuyNowItem();
    return () => { active = false; };
  }, [buyNowProductId, buyNowVariantId, buyNowQuantity, buyNowKey, locale, t]);

  const directCheckoutLoading = Boolean(buyNowProductId && !directCheckout);
  const checkoutItems = directCheckout?.item ? [directCheckout.item] : buyNowProductId ? [] : cart;
  const subtotal = checkoutItems.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryCharge = defaultDeliveryCharge;
  const total = subtotal + deliveryCharge;
  function applySavedAddress(address: SavedAddress | undefined) {
    setSavedAddressId(address?._id ?? "");
    setSelectedDivisionId(address?.divisionId ?? "");
    setSelectedDistrictId(address?.districtId ?? "");
    setSelectedUpazilaId(address?.upazilaId ?? "");
    setManualUpazila(address?.upazilaId ? "" : address?.upazila ?? "");
    setManualUpazilaSelected(Boolean(address && !address.upazilaId));
    setAddressFields({
      name: address?.name ?? "",
      phone: address?.phone ?? "",
      area: [address?.union, address?.area].filter(Boolean).join(", "),
      address: address?.address ?? "",
      label: address?.label ?? "",
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const selectedLocation = locations && selectedDivisionId && selectedDistrictId &&
        (selectedUpazilaId || (manualUpazilaSelected && manualUpazila.trim().length >= 2))
        ? {
            division: locations.divisions.find((item) => item.id === selectedDivisionId),
            district: locations.districts.find((item) => item.id === selectedDistrictId && item.divisionId === selectedDivisionId),
            upazila: selectedUpazilaId
              ? locations.upazilas.find((item) => item.id === selectedUpazilaId && item.districtId === selectedDistrictId)
              : undefined,
          }
        : null;
      if (!selectedLocation?.division || !selectedLocation.district || (selectedUpazilaId && !selectedLocation.upazila)) {
        throw new Error(t("selectCompleteLocation"));
      }
      const addressBody = {
        ...(savedAddressId ? { id: savedAddressId } : {}),
        label: addressFields.label,
        name: addressFields.name,
        phone: addressFields.phone,
        divisionId: selectedLocation.division.id,
        districtId: selectedLocation.district.id,
        ...(selectedLocation.upazila ? { upazilaId: selectedLocation.upazila.id } : {}),
        upazila: selectedLocation.upazila?.name ?? manualUpazila.trim(),
        area: addressFields.area,
        address: addressFields.address,
        isDefault: true,
      };
      if (customerSignedIn && saveAddress) {
        const saveResponse = await fetch("/api/customer/addresses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(addressBody),
        });
        const savedResult = await saveResponse.json() as { addresses?: SavedAddress[]; error?: string };
        if (!saveResponse.ok || !savedResult.addresses) {
          throw new Error(savedResult.error || t("savedAddressSaveFailed"));
        }
        setSavedAddresses(savedResult.addresses);
        const savedAddress = savedResult.addresses.find((address) =>
          address.name === addressBody.name && address.phone === addressBody.phone &&
          address.divisionId === addressBody.divisionId &&
          address.address === addressBody.address);
        if (savedAddress?._id) setSavedAddressId(savedAddress._id);
      }
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerInfo: {
            name: addressFields.name,
            phone: addressFields.phone,
            division: selectedLocation.division.name,
            divisionId: selectedLocation.division.id,
            district: selectedLocation.district.name,
            districtId: selectedLocation.district.id,
            upazila: selectedLocation.upazila?.name ?? manualUpazila.trim(),
            ...(selectedLocation.upazila ? { upazilaId: selectedLocation.upazila.id } : {}),
            area: addressFields.area,
            address: addressFields.address,
            notes: form.get("notes"),
          },
          items: checkoutItems.map((line) => ({ productId: line.id, ...(line.variantId ? { variantId: line.variantId } : {}), quantity: line.quantity })),
          paymentMethod: "COD",
        }),
      });
      const result = await response.json() as { item?: { _id: string }; deliveryAccessKey?: string; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Could not place your order");
      if (!buyNowProductId) clearCart();
      if (result.deliveryAccessKey) {
        try {
          window.sessionStorage.setItem(`delivery-access:${result.item._id}`, result.deliveryAccessKey);
        } catch {
          window.prompt(t("saveDeliveryKeyPrompt"), result.deliveryAccessKey);
        }
      }
      router.push(`/order-confirmation/${encodeURIComponent(result.item._id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not place your order");
    } finally {
      setBusy(false);
    }
  }
  if (directCheckoutLoading) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p>{t("loading")}</p></div>;
  if (directCheckout?.error) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p className="form-error" role="alert">{directCheckout.error}</p><Link href="/products" className="button-primary">{t("continueShopping")}</Link></div>;
  if (!checkoutItems.length) return <div className="page-shell"><h1 className="page-title">{t("checkout")}</h1><p>{t("emptyCart")}</p><Link href="/products" className="button-primary">{t("continueShopping")}</Link></div>;
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　<Link href="/cart">{t("cart")}</Link>　/　{t("checkout")}</p><h1 className="page-title">{t("checkout")}</h1><div className="split-layout"><form className="form-card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>{t("deliveryDetails")}</h2>{error && <p className="form-error">{error}</p>}
      {savedAddressError && <p className="form-error" role="alert">{t("savedAddressesLoadFailed")}</p>}
      {customerSignedIn && savedAddresses.length > 0 && <div className="field"><label htmlFor="savedAddress">{t("savedAddresses")}</label><select id="savedAddress" value={savedAddressId} onChange={(event) => applySavedAddress(savedAddresses.find((address) => address._id === event.target.value))}><option value="">{t("newDeliveryAddress")}</option>{savedAddresses.map((address, index) => <option key={address._id ?? index} value={address._id ?? ""}>{address.label || address.name} · {locale === "bn" ? address.districtBn ?? address.district : address.district}</option>)}</select></div>}
      <div className="field"><label htmlFor="name">{t("fullName")} *</label><input id="name" name="name" autoComplete="name" value={addressFields.name} onChange={(event) => setAddressFields((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={120} /></div>
      <div className="field"><label htmlFor="phone">{t("phoneNumber")} *</label><input id="phone" name="phone" type="tel" autoComplete="tel" value={addressFields.phone} onChange={(event) => setAddressFields((current) => ({ ...current, phone: event.target.value }))} required minLength={6} maxLength={30} /></div>
      <h3 className="checkout-address-heading">{t("bangladeshAddress")}</h3>
      <p className="subtle checkout-address-help">{t("addressStepsHelp")}</p>
      {locationError && <p className="form-error" role="alert">{t("locationLoadFailed")} <button type="button" className="button-secondary" onClick={() => setLocationRetry((attempt) => attempt + 1)}>{t("retry")}</button></p>}
      <div className="checkout-location-grid">
        <div className="field"><label htmlFor="division">{t("division")} *</label><select id="division" name="division" autoComplete="address-level1" value={selectedDivisionId} onChange={(event) => { setSelectedDivisionId(event.target.value); setSelectedDistrictId(""); setSelectedUpazilaId(""); setManualUpazila(""); setManualUpazilaSelected(false); }} required disabled={!locations}><option value="">{locations ? t("selectDivision") : t("loadingLocations")}</option>{locations?.divisions.map((item) => <option key={item.id} value={item.id}>{locale === "bn" ? item.bnName : item.name}</option>)}</select></div>
        <div className="field"><label htmlFor="district">{t("district")} *</label><select id="district" name="district" autoComplete="address-level2" value={selectedDistrictId} onChange={(event) => { setSelectedDistrictId(event.target.value); setSelectedUpazilaId(""); setManualUpazila(""); setManualUpazilaSelected(false); }} required disabled={!selectedDivisionId}><option value="">{t("selectDistrict")}</option>{locations?.districts.filter((item) => item.divisionId === selectedDivisionId).map((item) => <option key={item.id} value={item.id}>{locale === "bn" ? item.bnName : item.name}</option>)}</select></div>
        <div className="field"><label htmlFor="upazila">{t("upazilaThana")} *</label><select id="upazila" name="upazila" value={manualUpazilaSelected ? "other" : selectedUpazilaId} onChange={(event) => { const value = event.target.value; setManualUpazilaSelected(value === "other"); setSelectedUpazilaId(value === "other" ? "" : value); setManualUpazila(""); }} required disabled={!selectedDistrictId}><option value="">{t("selectUpazila")}</option>{locations?.upazilas.filter((item) => item.districtId === selectedDistrictId).map((item) => <option key={item.id} value={item.id}>{locale === "bn" ? item.bnName : item.name}</option>)}<option value="other">{t("locationNotListed")}</option></select>{manualUpazilaSelected && <input aria-label={t("enterThanaManually")} autoComplete="address-level3" value={manualUpazila} onChange={(event) => setManualUpazila(event.target.value)} placeholder={t("enterThanaManually")} required minLength={2} maxLength={120} />}</div>
      </div>
      <div className="field"><label htmlFor="area">{t("deliveryArea")} ({locale === "bn" ? "ঐচ্ছিক" : "optional"})</label><input id="area" name="area" autoComplete="address-level3" value={addressFields.area} onChange={(event) => setAddressFields((current) => ({ ...current, area: event.target.value }))} maxLength={120} placeholder={t("deliveryAreaPlaceholder")} /><small className="subtle">{t("deliveryAreaHelp")}</small></div>
      <div className="field"><label htmlFor="additionalAddress">{t("additionalAddress")} *</label><textarea id="additionalAddress" name="additionalAddress" autoComplete="street-address" value={addressFields.address} onChange={(event) => setAddressFields((current) => ({ ...current, address: event.target.value }))} required minLength={5} maxLength={500} placeholder={t("additionalAddressPlaceholder")} /></div>
      {customerSignedIn && <><div className="field"><label htmlFor="addressLabel">{t("addressLabel")}</label><input id="addressLabel" value={addressFields.label} onChange={(event) => setAddressFields((current) => ({ ...current, label: event.target.value }))} maxLength={60} placeholder={t("addressLabelPlaceholder")} /></div><label className="checkout-save-address"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} /> {t("saveAddressForNextTime")}</label></>}
      <div className="field"><label htmlFor="notes">{t("orderNotes")}</label><textarea id="notes" name="notes" maxLength={2000} /></div>
      <fieldset className="checkout-payment-options">
        <legend>{t("paymentMethod")}</legend>
        <label><input type="radio" name="payment" value="COD" defaultChecked /> {t("cashOnDelivery")}</label>
        <label className="payment-option-disabled"><input type="radio" name="payment" value="bkash" disabled /> {t("bkashPayment")}</label>
        <label className="payment-option-disabled"><input type="radio" name="payment" value="nagad" disabled /> {t("nagadPayment")}</label>
        <label className="payment-option-disabled"><input type="radio" name="payment" value="bank" disabled /> {t("bankPayment")}</label>
        <p className="subtle">{t("onlinePaymentUnavailable")}</p>
      </fieldset>
      <button className="button-primary" disabled={busy || !locations}>{busy ? t("placingOrder") : `${t("placeOrder")} · ${formatBdt(total)}`}</button>
    </form><div className="dashboard-card"><h2>{t("orderSummary")}</h2>{checkoutItems.map((line) => <div key={`${line.id}:${line.variantId ?? ""}`} style={{ display: "grid", gap: 2, fontSize: 12, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>{line.name}{line.variantLabel ? ` (${line.variantLabel})` : ""}</span><strong>{formatBdt(line.price * line.quantity)}</strong></div><div className="subtle">Qty: {line.quantity.toLocaleString("en-BD")} {unitLabel(line.unit, locale)} · Current: {formatBdt(line.price)} each</div></div>)}<hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} /><p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px" }}><span>Product total</span><span>{formatBdt(subtotal)}</span></p><p style={{ display: "flex", justifyContent: "space-between", margin: "0 0 6px" }}><span>Delivery charge</span><span>{formatBdt(deliveryCharge)}</span></p><strong style={{ display: "flex", justifyContent: "space-between" }}><span>Final payable</span><span>{formatBdt(total)}</span></strong></div></div></div>;
}
