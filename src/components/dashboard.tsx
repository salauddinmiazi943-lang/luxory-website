"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Home } from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { productUnits, quantityStep, unitLabel, type ProductUnit } from "@/lib/product-units";
import { categoryProductPreset } from "@/lib/category-product-options";
import { ProductEditor } from "@/components/product-editor";

type UserInfo = { id: string; name: string; email: string; role: string; permissions: string[] };
type Item = Record<string, unknown> & {
  _id: string; status?: string; title?: { en?: string; bn?: string }; name?: { en?: string; bn?: string };
  description?: { en?: string; bn?: string }; subtitle?: { en?: string; bn?: string };
  slug?: string; price?: number; discountPrice?: number; stock?: number; featured?: boolean; active?: boolean;
  image?: string; link?: string; order?: number; vendor?: string | { _id: string };
  category?: string | { _id: string; name?: { en?: string } }; images?: string[]; total?: number;
  approved?: boolean; customerInfo?: { name?: string; phone?: string; address?: string; notes?: string; division?: string; district?: string; upazila?: string; union?: string; area?: string };
  customerName?: string; message?: string; adminReply?: string; createdAt?: string; repliedAt?: string;
  product?: string | { _id?: string; slug?: string; title?: { en?: string; bn?: string } };
  unit?: string; variants?: { _id?: string; label: string; price: number; stock: number }[];
  items?: { _id?: string; productId?: string; variantId?: string; vendorId?: string; title: string; variantLabel?: string; unit?: string; unitPrice?: number; quantity: number; status: string }[];
  delivery?: {
    verificationStatus?: string; deliveredAt?: string; deliveredBy?: string; notes?: string;
    failedAt?: string; failedBy?: string; failedReason?: string;
    assignment?: { assignedTo: string; assignedBy: string; assignedAt: string };
    reports?: { _id: string; reason: string; details?: string; status: string }[];
    returns?: { _id: string; title: string; expectedQuantity: number; countedQuantity: number; status: string; condition?: string; receivedBy: string }[];
    handovers?: {
      _id: string; productId: string; variantId?: string; title: string; assignedTo: string; assignedQuantity: number;
      acceptedQuantity: number; deliveredQuantity: number; verifiedDeliveredQuantity: number; returnedQuantity: number;
      missingQuantity: number; disputedQuantity: number; codDue: number; codCollected: number; codSettled: number;
      codDisputed: number; acceptedAt?: string; settledAt?: string;
    }[];
  };
  deliveryAudit?: { orderId: string; actorId: string; actorRole: string; event: string; occurredAt: string; details?: string; hash: string; signature?: string }[];
  deliveryAuditValid?: boolean;
  deliveryAuditProtection?: "signed" | "hash-only";
};
type Category = { _id: string; name: { en: string; bn: string }; slug: string };
type VendorOption = { id: string; name: string; email: string };
type DeliveryStaffOption = { id: string; name: string; role: string };
type DeliveryAssigneeOption = { id: string; name: string; employeeId: string };
type ProductVariantDraft = { label: string; price: string; stock: string };
const permissionOptions = [
  ["manage_categories", "Categories"], ["manage_banners", "Banners"], ["manage_products", "Products"],
  ["manage_featured", "Featured products"], ["manage_offers", "Offers"], ["manage_announcements", "Announcements"], ["view_bookings", "View bookings"], ["manage_bookings", "Manage bookings"],
  ["manage_delivery_staff", "Delivery staff"], ["manage_vendors", "Vendor applications"], ["view_messages", "Contact messages"],
];
const statuses = ["pending", "confirmed", "shipped", "cancelled"];

async function fetchDashboard(url: string) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (reason) {
    if (reason instanceof Error && reason.name === "TimeoutError") {
      throw new Error("The server took too long to respond. Check the database connection and try again.");
    }
    throw reason;
  }
}

export function Dashboard({ kind }: { kind: "admin" | "vendor" }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [tab, setTab] = useState("Overview");
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariantDraft[]>([]);
  const [productUnit, setProductUnit] = useState<ProductUnit>("piece");
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const router = useRouter();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newOffer, setNewOffer] = useState<{
    title: { en: string; bn: string };
    subtitle: { en: string; bn: string };
    link: string;
    order: number;
    active: boolean;
    image: string;
  }>({
    title: { en: "", bn: "" },
    subtitle: { en: "", bn: "" },
    link: "/products",
    order: 0,
    active: true,
    image: "",
  });

  const can = useCallback((permission: string) => user?.role === "super_admin" || (user?.role === "admin" && user.permissions.includes(permission)), [user]);
  const menu = useMemo(() => {
    if (!user) return [];
    if (user.role === "vendor") return ["Overview", "My products", "My bookings", "Profile"];
    const choices: [string, string][] = [["Categories", "manage_categories"], ["Banners", "manage_banners"], ["Products", "manage_products"], ["Product comments", "manage_products"], ["Featured products", "manage_featured"], ["Offers", "manage_offers"], ["Announcements", "manage_announcements"], ["Bookings", "view_bookings"], ["Delivery staff", "manage_delivery_staff"], ["Vendor applications", "manage_vendors"], ["Messages", "view_messages"]];
    return ["Overview", ...choices.filter(([, permission]) => can(permission)).map(([label]) => label), ...(user.role === "super_admin" ? ["Admin users", "Coin & Reward Settings", "Rewards & Vouchers Monitor"] : []), ...((user.role === "super_admin" || user.role === "admin") ? ["হিসাব-নিকাশ"] : []), "Profile"];
  }, [user, can]);

  const load = useCallback(async (target: string) => {
    setError(""); setNotice(""); setLoading(true);
    try {
      if (target === "Overview") {
        if (kind === "admin") {
          const response = await fetchDashboard("/api/admin/summary");
          const text = await response.text(); let data: Record<string, number> & { error?: string } = {};
          try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Server returned an invalid response (summary)."); }
          if (!response.ok) throw new Error((data as any).error || "Could not load dashboard");
          setCounts(data as any);
        } else {
          const [products, orders] = await Promise.all([fetchDashboard("/api/products?limit=1"), fetchDashboard("/api/orders")]);
          let productData: any = {}; let orderData: any = {};
          try { productData = JSON.parse(await products.text() || "{}"); } catch { productData = {}; }
          try { orderData = JSON.parse(await orders.text() || "{}"); } catch { orderData = {}; }
          setCounts({ products: productData.total ?? 0, bookings: orderData.items?.length ?? 0 });
        }
        setItems([]);
        return;
      }
      if (target === "Profile") { setItems([]); return; }
      if (target === "Categories") {
        const response = await fetchDashboard("/api/categories?all=true");
        const text = await response.text(); let data: any = {};
        try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Server returned an invalid response (categories)."); }
        if (!response.ok) throw new Error(data.error || "Could not load categories");
        setCategories(data.items ?? []); setItems(data.items as unknown as Item[] ?? []); return;
      }
      const endpoints: Record<string, string> = {
        Banners: "/api/banners?all=true", Products: "/api/products?all=true&limit=100",
        "My products": "/api/products?all=true&limit=100", "Featured products": "/api/products?all=true&limit=100",
        Offers: "/api/offers?all=true", Announcements: "/api/announcements?all=true", Bookings: "/api/orders", "My bookings": "/api/orders", "Vendor applications": "/api/vendor-applications",
        Messages: "/api/contact", "Admin users": "/api/admin/users",
        "Delivery staff": "/api/admin/delivery-staff/accounts",
        "Product comments": "/api/admin/product-comments",
      };
      const response = await fetchDashboard(endpoints[target] ?? "");
      const _safeText_data = await response.text(); let data: { items?: Item[]; error?: string } = {};
      try { data = _safeText_data ? JSON.parse(_safeText_data) : {}; } catch { data = { error: _safeText_data?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
      if (!response.ok) throw new Error(data.error || "Could not load this section");
      setItems(data.items ?? []);
      if (target === "Products" || target === "My products") {
        const [categoriesResponse, vendorsResponse] = await Promise.all([fetchDashboard("/api/categories"), fetchDashboard("/api/admin/vendors")]);
        try { if (categoriesResponse.ok) { const ct = await categoriesResponse.text(); setCategories((ct ? JSON.parse(ct) : {}).items ?? []); } } catch {}
        try { if (vendorsResponse && vendorsResponse.ok) { const vt = await vendorsResponse.text(); setVendors((vt ? JSON.parse(vt) : {}).items ?? []); } } catch {}
      }
    } catch (reason) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Could not load this section");
    } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { nav: (path: string) => void }).nav = (path: string) => {
        router.push(path);
      };
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    async function verifyAccess() {
      try {
        const response = await fetchDashboard("/api/auth/me");
        const _safeText_data = await response.text(); let data: { user?: UserInfo; error?: string } = {};
        try { data = _safeText_data ? JSON.parse(_safeText_data) : {}; } catch { data = { error: _safeText_data?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
        if (response.status === 401 || !data.user) {
          router.replace(kind === "admin" ? "/admin/login" : "/account");
          return;
        }
        if (!response.ok) throw new Error(data.error || "Could not verify access");
        if (kind === "admin" && data.user.role !== "super_admin" && data.user.role !== "admin") {
          router.replace("/admin/login?error=unauthorized");
          return;
        }
        if (active) setUser(data.user);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not verify access");
      } finally {
        if (active && tab !== "Overview") setLoading(false);
      }
    }
    void verifyAccess();
    return () => { active = false; };
  }, [kind, router, tab]);
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => { void load(tab); }, 0);
    return () => window.clearTimeout(timer);
  }, [user, tab, load]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (field: string) => ({ en: String(form.get(`${field}En`) ?? "").trim(), bn: String(form.get(`${field}Bn`) ?? "").trim() });
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};
      if (tab === "Categories") {
        endpoint = "/api/categories";
        const parentCategory = String(form.get("parentCategory") ?? "").trim();
        body = {
          name: text("name"),
          image,
          parentCategory: parentCategory || undefined,
          isFeatured: form.get("isFeatured") === "on",
          active: form.get("active") === "on",
          order: Number(form.get("order") || 0),
        };
      } else if (tab === "Banners") {
        if (!image) throw new Error("Upload a banner image before adding the banner.");
        endpoint = "/api/banners";
        const buttonText = text("buttonText");
        const bgColor = String(form.get("bgColor") ?? "").trim();
        body = {
          title: text("title"),
          subtitle: text("subtitle"),
          buttonText: buttonText.en ? buttonText : undefined,
          bgColor: bgColor || undefined,
          image,
          link: String(form.get("link") ?? "").trim(),
          order: Number(form.get("order") || 0),
          active: form.get("active") === "on",
          startDate: String(form.get("startDate") ?? "").trim() || undefined,
          endDate: String(form.get("endDate") ?? "").trim() || undefined,
        };
      } else if (tab === "Products" || tab === "My products") {
        endpoint = "/api/products";
        const unit = productUnit;
        const variants = productVariants.map((variant) => ({ label: variant.label.trim(), price: Number(variant.price), stock: Number(variant.stock) }));
        const hasVariants = variants.length > 0;
        const prices = variants.map((variant) => variant.price);
        const stocks = variants.map((variant) => variant.stock);
        body = {
          title: text("title"), description: text("description"),
          price: hasVariants ? Math.min(...prices) : Number(form.get("price")),
          ...(!hasVariants && form.get("discountPrice") ? { discountPrice: Number(form.get("discountPrice")) } : {}),
          stock: hasVariants ? stocks.reduce((total, stock) => total + stock, 0) : Number(form.get("stock")),
          unit, variants, category: form.get("category"), images,
          vendor: form.get("vendor") || undefined, active: form.get("active") === "on", featured: form.get("featured") === "on",
          ...(String(form.get("resellerPrice") || "").trim() ? { resellerPrice: Number(form.get("resellerPrice")) } : {}),
          ...(String(form.get("wholesalerPrice") || "").trim() ? { wholesalerPrice: Number(form.get("wholesalerPrice")) } : {}),
          ...(String(form.get("resellerMoq") || "").trim() ? { resellerMoq: Number(form.get("resellerMoq")) } : {}),
          ...(String(form.get("wholesalerMoq") || "").trim() ? { wholesalerMoq: Number(form.get("wholesalerMoq")) } : {}),
        };
      } else if (tab === "Admin users") {
        endpoint = "/api/admin/users";
        body = { name: form.get("name"), email: form.get("email"), password: form.get("password"), permissions: selectedPermissions };
      } else if (tab === "Delivery staff") {
        endpoint = "/api/admin/delivery-staff/accounts";
        body = {
          employeeId: form.get("employeeId"),
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          address: form.get("address"),
          password: form.get("password"),
        };
      } else {
        return;
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const _safeText_result = await response.text(); let result: { error?: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } } = {};
      try { result = _safeText_result ? JSON.parse(_safeText_result) : {}; } catch { result = { error: _safeText_result?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
      if (!response.ok) {
        const details = result.details;
        const validationErrors = [
          ...Object.entries(details?.fieldErrors ?? {}).flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`)),
          ...(details?.formErrors ?? []),
        ];
        throw new Error(validationErrors.length
          ? `${result.error || "Could not save"} — ${validationErrors.join("; ")}`
          : result.error || "Could not save");
      }
      const savedItem = (result as { item?: Item }).item;
      formElement.reset(); setImage(""); setImages([]); setProductVariants([]); setProductUnit("piece"); setSelectedProductCategory(""); setSelectedPermissions([]);
      await load(tab);
      if (tab === "Banners") {
        if (!savedItem?._id) {
          setNotice("Banner request succeeded, but the saved banner could not be confirmed. Refresh and check the banner list.");
        } else if (savedItem.active === false) {
          setNotice("Banner saved, but it is inactive so it will not appear on the homepage hero section. Activate it to display it.");
        } else if (typeof savedItem.image !== "string" || !/^https?:\/\//.test(savedItem.image)) {
          setNotice("Banner saved, but its image URL is missing or invalid so it cannot be displayed on the homepage.");
        } else {
          setNotice("Banner saved and active. It should now appear in the homepage hero section.");
        }
      } else {
        setNotice("Saved successfully.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save");
    } finally { setBusy(false); }
  }

  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>, multiple = false) {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    if (multiple && images.length + files.length > 12) {
      setError(`You can upload up to 12 images. ${images.length} already uploaded.`);
      input.value = "";
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Each image must be smaller than 10 MB.");
      input.value = "";
      return;
    }
    setBusy(true); setError("");
    try {
      const results = await Promise.allSettled(files.map((file) => uploadToCloudinary(file)));
      const urls = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (multiple) setImages((current) => [...current, ...urls]);
      else if (urls[0]) setImage(urls[0]);
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) {
        setError(failure.reason instanceof Error ? failure.reason.message : `${urls.length} image(s) uploaded, but another image failed.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Image upload failed"); }
    finally { setBusy(false); input.value = ""; }
  }

  async function update(url: string, method: "PATCH" | "DELETE" | "POST", body?: unknown): Promise<string | null> {
    setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const _safeText_result = await response.text(); let result: { error?: string; temporaryPassword?: string } = {};
      try { result = _safeText_result ? JSON.parse(_safeText_result) : {}; } catch { result = { error: _safeText_result?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
      if (!response.ok) throw new Error(result.error || "Could not update");
      await load(tab);
      setNotice(result.temporaryPassword ? `Vendor approved. Share this temporary password securely: ${result.temporaryPassword}` : "Updated successfully.");
      return null;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not update";
      setError(message);
      return message;
    }
  }

  function selectProductCategory(categoryId: string) {
    setSelectedProductCategory(categoryId);
    const category = categories.find((item) => item._id === categoryId);
    const preset = categoryProductPreset(category);
    if (!preset) return;
    const msg = `Apply category preset? Unit: ${unitLabel(preset.unit)}${preset.options.length ? `, suggested options: ${preset.options.join(", ")}` : ""}. You can still change the unit/options.`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setProductUnit(preset.unit);
    if (preset.options.length) {
      setProductVariants((current) => preset.options.map((label) => {
        const existing = current.find((variant) => variant.label.trim().toLowerCase() === label.toLowerCase());
        return existing ?? { label, price: "", stock: "" };
      }));
    }
  }

  const title = kind === "admin" ? "Store administration" : "Vendor studio";
  if (!user) {
    if (loading) return <div className="page-shell">Loading dashboard…</div>;
    return <div className="page-shell"><p className="form-error" role="alert">{error || "Could not verify access."}</p><button className="button-secondary" onClick={() => window.location.reload()}>Try again</button></div>;
  }
  return <div className="page-shell dashboard-page">
    <header className="dashboard-heading">
      <div>
        <p className="eyebrow">ESHOP WORKSPACE</p>
        <h1>{title}</h1>
        <p>{kind === "admin" ? "Manage your store, products, and orders in one place." : "Manage your listings, orders, and vendor profile in one place."}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => {
            if (typeof (window as unknown as { nav?: (p: string) => void }).nav === "function") {
              (window as unknown as { nav: (p: string) => void }).nav("/");
            } else {
              router.push("/");
            }
          }}
          className="button-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
        >
          <Home size={15} /> Storefront Home
        </button>
        <span className="dashboard-role">{user?.role.replace("_", " ")}</span>
      </div>
    </header>
    <div className="dashboard-layout">
      <aside className="dashboard-nav">
        <p className="dashboard-nav-label">WORKSPACE</p>
        {menu.map((item) => <button type="button" key={item} className={tab === item ? "selected" : ""} onClick={() => item === "হিসাব-নিকাশ" ? router.push("/accounts") : setTab(item)}>{item}</button>)}
        <button type="button" className="dashboard-signout" onClick={async () => { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) { setError("Could not sign out. Please try again."); return; } window.dispatchEvent(new Event("eshop:auth-changed")); router.replace("/account"); }}>Sign out</button>
      </aside>
      <section className="dashboard-card">
        <div className="dashboard-card-heading"><div><p>MANAGE YOUR STORE</p><h2>{tab}</h2></div></div>
        {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
        {loading ? <p className="subtle">Loading…</p> : tab === "Overview" ? <div className="stat-grid">{Object.entries(counts).map(([key, value]) => <div className="stat-card" key={key}><span>{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{value}</strong></div>)}</div>
          : tab === "Profile" ? user?.role === "vendor" ? <VendorProfile /> : <div><p><strong>{user?.name}</strong></p><p>{user?.email}</p><p className="subtle">Role: {user?.role}</p></div>
          : tab === "Coin & Reward Settings" ? <CoinRewardSettingsPanel />
          : tab === "Rewards & Vouchers Monitor" ? <RewardsVouchersMonitor />
          : <>
            {["Categories", "Banners", "Products", "My products", "Admin users", "Delivery staff"].includes(tab) && <form className="admin-form" onSubmit={submitForm}>
              {tab === "Categories" && <>
                <div className="field"><label>Category name (English)</label><input name="nameEn" required maxLength={200} /></div><div className="field"><label>Category name (বাংলা)</label><input name="nameBn" maxLength={200} /></div>
                <div className="field"><label>Parent category (optional, for sub-category)</label><select name="parentCategory" defaultValue=""><option value="">None</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name?.en || category.name?.bn || category._id}</option>)}</select></div>
                <div className="field"><label>Order / Priority</label><input name="order" type="number" defaultValue={0} /></div>
                <div className="field wide"><label>Category image / icon</label><input type="file" accept="image/*" onChange={(event) => uploadFile(event)} />{image && <small className="subtle">Image uploaded</small>}</div>
                <label className="admin-check"><input type="checkbox" name="isFeatured" /> Show in homepage category strip (Featured)</label>
                <label className="admin-check"><input type="checkbox" name="active" defaultChecked /> Active</label>
              </>}
              {tab === "Banners" && <>
                <div className="field"><label>Title (English)</label><input name="titleEn" required maxLength={500} /></div><div className="field"><label>Title (বাংলা)</label><input name="titleBn" maxLength={500} /></div>
                <div className="field"><label>Subtitle (English)</label><input name="subtitleEn" required maxLength={500} /></div><div className="field"><label>Subtitle (বাংলা)</label><input name="subtitleBn" maxLength={500} /></div>
                <div className="field"><label>Shop Now button text (English, optional)</label><input name="buttonTextEn" maxLength={120} placeholder="Shop Now" /></div><div className="field"><label>Shop Now button text (বাংলা, optional)</label><input name="buttonTextBn" maxLength={120} /></div>
                <div className="field"><label>Background color (optional)</label><input name="bgColor" defaultValue="" maxLength={120} placeholder="#020617, CSS color, or gradient" /></div><div className="field"><label>Destination link (optional)</label><input name="link" defaultValue="" placeholder="Leave blank for no redirect" maxLength={500} /></div>
                <div className="field"><label>Sort order</label><input name="order" type="number" defaultValue={0} /></div><div className="field"><label>Start date (optional)</label><input name="startDate" type="datetime-local" /></div>
                <div className="field"><label>End date (optional)</label><input name="endDate" type="datetime-local" /></div><div className="field"></div>
                <div className="field wide"><label>Banner image</label><input type="file" accept="image/*" onChange={(event) => uploadFile(event)} />{image && <><small className="subtle">Image uploaded</small><div className="product-image-previews"><div className="product-image-preview"><Image src={image} alt="Uploaded banner preview" width={448} height={176} unoptimized /><button type="button" onClick={() => setImage("")}>Remove image</button></div></div></>}</div>
                <label className="admin-check"><input type="checkbox" name="active" defaultChecked /> Active</label>
                <div className="wide" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="button-secondary" onClick={(event) => {
                    const form = event.currentTarget.closest("form");
                    if (!form) return;
                    const formData = new FormData(form);
                    const titleEn = String(formData.get("titleEn") ?? "").trim();
                    const subtitleEn = String(formData.get("subtitleEn") ?? "").trim();
                    if (!titleEn || !subtitleEn) { setError("Enter title and subtitle before preview."); return; }
                    if (!image) { setError("Upload a banner image before preview."); return; }
                    const previewWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=700");
                    if (!previewWindow) { setError("Allow pop-ups to view the banner preview."); return; }
                    const buttonTextEn = String(formData.get("buttonTextEn") ?? "").trim() || "Shop Now";
                    const bgColor = String(formData.get("bgColor") ?? "").trim() || "#020617";
                    const link = String(formData.get("link") ?? "").trim();
                    const safeTitle = titleEn.replace(/</g, "&lt;");
                    const safeSubtitle = subtitleEn.replace(/</g, "&lt;");
                    const safeButton = buttonTextEn.replace(/</g, "&lt;");
                    const safeImage = image.replace(/"/g, "&quot;");
                    const safeLink = link.replace(/</g, "&lt;");
                    const safeBg = bgColor.replace(/["<>]/g, "");
                    previewWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Banner Preview</title><style>body{margin:0;font-family:system-ui,sans-serif;background:${safeBg}}.wrap{position:relative;max-width:1200px;margin:0 auto}img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;background:${safeBg}}.overlay{position:absolute;inset:0;display:flex;align-items:flex-end;padding:28px;background:linear-gradient(90deg,rgba(2,6,23,.72),rgba(2,6,23,0) 70%);color:#fff}h2{margin:0;font-size:34px}p{margin:8px 0 0;max-width:520px}.btn{display:inline-block;margin-top:14px;padding:12px 18px;border-radius:4px;background:#c5a059;color:#fff;font-weight:700;text-decoration:none}.meta{padding:12px 16px;color:#d7e3ea;font-size:13px;background:#071b2b}</style></head><body><div class="wrap"><img src="${safeImage}" alt="${safeTitle}"/><div class="overlay"><div><h2>${safeTitle}</h2><p>${safeSubtitle}</p>${link ? `<a class="btn" href="#">${safeButton}</a>` : `<span class="btn">${safeButton}</span>`}</div></div></div><div class="meta">Preview only (not published). Background: ${safeBg} · Destination: ${safeLink || "none / non-clickable"}</div></body></html>`);
                    previewWindow.document.close();
                  }}>Preview before publish</button>
                </div>
              </>}
              {(tab === "Products" || tab === "My products") && <>
                <div className="field"><label>Product name (English)</label><input name="titleEn" required maxLength={500} /></div><div className="field"><label>Product name (বাংলা)</label><input name="titleBn" maxLength={500} /></div>
                <div className="field wide"><label>Description (English)</label><textarea name="descriptionEn" required maxLength={5000} /></div><div className="field wide"><label>Description (বাংলা)</label><textarea name="descriptionBn" maxLength={5000} /></div>
                <div className="field"><label>Category</label><select name="category" required value={selectedProductCategory} onChange={(event) => selectProductCategory(event.target.value)}><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name.en}</option>)}</select><small className="subtle">Category suggestions fill in standard sizes or packs. Add a matching category in the Categories tab if it is not listed.</small></div>
                <div className="field"><label>{productVariants.length ? "Stock counted in" : "Selling unit"}</label><select name="unit" value={productUnit} disabled={productVariants.length > 0} onChange={(event) => setProductUnit(event.target.value as ProductUnit)}>{productUnits.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></div>
                {productVariants.length === 0 ? <>
                  <div className="wide unit-options-toggle"><span>Need sizes or pack options? Add size / volume options with separate prices and stock.</span><button type="button" className="button-secondary" onClick={() => setProductVariants([{ label: "", price: "", stock: "" }])}>Add size / volume options</button></div>
                  <div className="field"><label>Regular price per {unitLabel(productUnit)} (৳)</label><input name="price" type="number" min="0" step="0.01" required /></div><div className="field"><label>Sale price per {unitLabel(productUnit)} (৳, optional)</label><input name="discountPrice" type="number" min="0" step="0.01" /></div>
                  <div className="field"><label>Reseller price per {unitLabel(productUnit)} (৳, optional)</label><input name="resellerPrice" type="number" min="0" step="0.01" /></div><div className="field"><label>Reseller MOQ ({unitLabel(productUnit)})</label><input name="resellerMoq" type="number" min="0.01" step={quantityStep(productUnit)} defaultValue="1" /></div>
                  <div className="field"><label>Wholesaler price per {unitLabel(productUnit)} (৳, optional)</label><input name="wholesalerPrice" type="number" min="0" step="0.01" /></div><div className="field"><label>Wholesaler MOQ ({unitLabel(productUnit)})</label><input name="wholesalerMoq" type="number" min="0.01" step={quantityStep(productUnit)} defaultValue="1" /></div>
                  <div className="field"><label>Stock ({unitLabel(productUnit)})</label><input name="stock" type="number" min="0" step={quantityStep(productUnit)} required /></div>
                </> : <div className="wide product-variants-field">
                  <div className="product-variants-heading"><div><strong>Size / volume options</strong><small>Set a separate price and available stock for each option. The selected category filled in suggested options.</small></div><button type="button" className="button-secondary" onClick={() => setProductVariants((current) => [...current, { label: "", price: "", stock: "" }])}>Add option</button></div>
                  {productVariants.map((variant, index) => <div className="product-variant-row" key={index}>
                    <div className="field"><label>Size / option</label><input value={variant.label} required maxLength={60} placeholder="e.g. XL or 50 ml" onChange={(event) => setProductVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></div>
                    <div className="field"><label>Price per option (৳)</label><input type="number" min="0" step="0.01" value={variant.price} required onChange={(event) => setProductVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} /></div>
                    <div className="field"><label>Available stock ({unitLabel(productUnit)})</label><input type="number" min="0" step={quantityStep(productUnit)} value={variant.stock} required onChange={(event) => setProductVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stock: event.target.value } : item))} /></div>
                    <button type="button" className="remove-variant-button" aria-label={`Remove option ${index + 1}`} onClick={() => setProductVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </div>)}
                </div>}
                {user?.role !== "vendor" && <div className="field"><label>Vendor (optional)</label><select name="vendor" defaultValue=""><option value="">Store product</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.email}</option>)}</select></div>}
                <div className="field wide"><label>Product images (up to 12)</label><input type="file" accept="image/*" multiple onChange={(event) => uploadFile(event, true)} />{images.length > 0 && <><small className="subtle">{images.length} image(s) uploaded</small><div className="product-image-previews">{images.map((url, index) => <div className="product-image-preview" key={url}><Image src={url} alt={`Uploaded product ${index + 1}`} width={224} height={176} unoptimized /><button type="button" aria-label={`Remove product image ${index + 1}`} onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>Remove</button></div>)}</div></>}</div>
                {user?.role !== "vendor" && <><label className="admin-check"><input type="checkbox" name="active" defaultChecked /> Active</label><label className="admin-check"><input type="checkbox" name="featured" /> Featured</label></>}
              </>}
              {tab === "Admin users" && <>
                <div className="field"><label>Name</label><input name="name" required maxLength={120} /></div><div className="field"><label>Email</label><input name="email" type="email" required maxLength={254} /></div>
                <div className="field wide"><label>Initial password (at least 10 characters)</label><input name="password" type="password" required minLength={10} maxLength={128} /></div>
                <div className="wide permissions-field"><p>Permissions</p><div className="permission-grid">{permissionOptions.map(([permission, label]) => <label className="permission-option" key={permission}><input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={(event) => setSelectedPermissions((current) => event.target.checked ? [...current, permission] : current.filter((value) => value !== permission))} />{label}</label>)}</div></div>
              </>}
              {tab === "Delivery staff" && <>
                <div className="field"><label htmlFor="delivery-employee-id">Employee ID</label><input id="delivery-employee-id" name="employeeId" required minLength={2} maxLength={32} pattern="[A-Za-z0-9-]+" /></div>
                <div className="field"><label htmlFor="delivery-employee-name">Name</label><input id="delivery-employee-name" name="name" required minLength={2} maxLength={120} /></div>
                <div className="field"><label htmlFor="delivery-employee-email">Login email</label><input id="delivery-employee-email" name="email" type="email" required maxLength={254} /></div>
                <div className="field"><label htmlFor="delivery-employee-phone">Phone</label><input id="delivery-employee-phone" name="phone" type="tel" required minLength={6} maxLength={30} /></div>
                <div className="field wide"><label htmlFor="delivery-employee-address">Address</label><textarea id="delivery-employee-address" name="address" required minLength={5} maxLength={1000} /></div>
                <div className="field wide"><label htmlFor="delivery-employee-password">Initial password (at least 10 characters)</label><input id="delivery-employee-password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></div>
              </>}
              <button className="button-primary wide" disabled={busy}>{busy ? "Saving…" : tab === "Admin users" ? "Create sub-admin" : tab === "Delivery staff" ? "Create delivery staff account" : `Add ${tab === "My products" ? "product" : tab.slice(0, -1)}`}</button>
            </form>}
            <div className="data-table-wrap"><DataTable tab={tab} items={items} update={update} can={can} categories={categories} vendors={vendors} userRole={user?.role ?? ""} userId={user?.id ?? ""} setError={setError} setNotice={setNotice} showAddForm={showAddForm} setShowAddForm={setShowAddForm} newOffer={newOffer} setNewOffer={setNewOffer} load={load} /></div>
          </>}
      </section>
    </div>
  </div>;
}

function VendorProfile() {
  const [profile, setProfile] = useState({ name: "", email: "", shopName: "", phone: "", address: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/vendor/profile").then(async (response) => {
      const _safeText_result = await response.text(); let result: { profile?: typeof profile; error?: string } = {};
      try { result = _safeText_result ? JSON.parse(_safeText_result) : {}; } catch { result = { error: _safeText_result?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
      if (!response.ok || !result.profile) throw new Error(result.error || "Could not load profile");
      setProfile({ name: result.profile.name, email: result.profile.email, shopName: result.profile.shopName ?? "", phone: result.profile.phone ?? "", address: result.profile.address ?? "" });
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load profile"));
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/vendor/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), address: form.get("address") }),
      });
      const _safeText_result = await response.text(); let result: { profile?: typeof profile; error?: string } = {};
      try { result = _safeText_result ? JSON.parse(_safeText_result) : {}; } catch { result = { error: _safeText_result?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
      if (!response.ok || !result.profile) throw new Error(result.error || "Could not update profile");
      setProfile({ name: result.profile.name, email: result.profile.email, shopName: result.profile.shopName ?? "", phone: result.profile.phone ?? "", address: result.profile.address ?? "" });
      setNotice("Profile saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update profile"); }
    finally { setBusy(false); }
  }
  return <form className="form-card" onSubmit={save}>{error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <div className="field"><label htmlFor="vendor-name">Name</label><input id="vendor-name" name="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={120} /></div>
    <div className="field"><label>Shop name</label><input value={profile.shopName} readOnly /></div>
    <div className="field"><label>Email</label><input value={profile.email} readOnly /></div>
    <div className="field"><label htmlFor="vendor-phone">Phone</label><input id="vendor-phone" name="phone" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} required minLength={6} maxLength={30} /></div>
    <div className="field"><label htmlFor="vendor-address">Address</label><textarea id="vendor-address" name="address" value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} required minLength={5} maxLength={1000} /></div>
    <button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
  </form>;
}

type CoinRewardForm = {
  coinEarning: { retailPer1000: number; resellerPer1000: number; wholesalerPer1000: number };
  coinRedemption: { coins: number; bdt: number; minRedeemCoins: number };
  voucher: { purchaseThreshold: number; voucherAmount: number; expiryDays: number; minOrderAmount: number };
  toggles: { rewardSystemEnabled: boolean; coinUsageEnabled: boolean; voucherSystemEnabled: boolean };
};
const coinRewardDefaults: CoinRewardForm = {
  coinEarning: { retailPer1000: 3, resellerPer1000: 3, wholesalerPer1000: 3 },
  coinRedemption: { coins: 100, bdt: 5, minRedeemCoins: 500 },
  voucher: { purchaseThreshold: 50000, voucherAmount: 500, expiryDays: 30, minOrderAmount: 0 },
  toggles: { rewardSystemEnabled: false, coinUsageEnabled: false, voucherSystemEnabled: false },
};

function CoinRewardSettingsPanel() {
  const [form, setForm] = useState<CoinRewardForm>(coinRewardDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/coin-reward-settings")
      .then(async (response) => {
        const text = await response.text();
        let data: any = {};
        try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(text?.startsWith("<") ? "Server returned an invalid response. Please refresh or restart the dev server." : "Invalid server response"); }
        if (!response.ok) throw new Error(data?.error || "Could not load coin & reward settings");
        if (active) setForm({
          coinEarning: { ...coinRewardDefaults.coinEarning, ...(data.coinEarning ?? {}) },
          coinRedemption: { ...coinRewardDefaults.coinRedemption, ...(data.coinRedemption ?? {}) },
          voucher: { ...coinRewardDefaults.voucher, ...(data.voucher ?? {}) },
          toggles: { ...coinRewardDefaults.toggles, ...(data.toggles ?? {}) },
        });
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function validate(v: CoinRewardForm) {
    const nums = [v.coinEarning.retailPer1000, v.coinEarning.resellerPer1000, v.coinEarning.wholesalerPer1000, v.coinRedemption.bdt, v.voucher.purchaseThreshold, v.voucher.voucherAmount, v.voucher.minOrderAmount];
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return "Rates and amounts must be 0 or greater.";
    if (!Number.isInteger(v.coinRedemption.coins) || v.coinRedemption.coins < 1) return "Redemption coin value must be an integer of at least 1.";
    if (!Number.isInteger(v.coinRedemption.minRedeemCoins) || v.coinRedemption.minRedeemCoins < 0) return "Minimum redeem coins must be 0 or greater.";
    if (!Number.isInteger(v.voucher.expiryDays) || v.voucher.expiryDays < 0) return "Voucher expiry days must be 0 or greater.";
    return "";
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    const msg = validate(form);
    if (msg) { setError(msg); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/coin-reward-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(text?.startsWith("<") ? "Server returned an invalid response. Please refresh or restart the dev server." : "Invalid server response"); }
      if (!response.ok) throw new Error(data?.error || "Could not save settings");
      setForm({
        coinEarning: { ...coinRewardDefaults.coinEarning, ...(data.coinEarning ?? {}) },
        coinRedemption: { ...coinRewardDefaults.coinRedemption, ...(data.coinRedemption ?? {}) },
        voucher: { ...coinRewardDefaults.voucher, ...(data.voucher ?? {}) },
        toggles: { ...coinRewardDefaults.toggles, ...(data.toggles ?? {}) },
      });
      setNotice("Coin & Reward settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings");
    } finally { setSaving(false); }
  }

  if (loading) return <p className="subtle">Loading settings…</p>;
  return <form className="admin-form" onSubmit={save} aria-label="Coin and Reward Settings">
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <h3 style={{ gridColumn: "1 / -1", margin: "4px 0" }}>Global Toggles (চালু/বন্ধ)</h3>
    <label className="admin-check"><input type="checkbox" checked={form.toggles.rewardSystemEnabled} onChange={(e) => setForm({ ...form, toggles: { ...form.toggles, rewardSystemEnabled: e.target.checked } })} /> Reward System Enabled</label>
    <label className="admin-check"><input type="checkbox" checked={form.toggles.coinUsageEnabled} onChange={(e) => setForm({ ...form, toggles: { ...form.toggles, coinUsageEnabled: e.target.checked } })} /> Coin Usage Enabled</label>
    <label className="admin-check"><input type="checkbox" checked={form.toggles.voucherSystemEnabled} onChange={(e) => setForm({ ...form, toggles: { ...form.toggles, voucherSystemEnabled: e.target.checked } })} /> Voucher System Enabled</label>

    <h3 style={{ gridColumn: "1 / -1", margin: "12px 0 4px" }}>Coin Earning (প্রতি ৳১,০০০ কেনাকাটায় Coin)</h3>
    <div className="field"><label>Retail (Customer) coins per ৳1,000</label><input type="number" min="0" step="0.01" value={form.coinEarning.retailPer1000} onChange={(e) => setForm({ ...form, coinEarning: { ...form.coinEarning, retailPer1000: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Reseller coins per ৳1,000</label><input type="number" min="0" step="0.01" value={form.coinEarning.resellerPer1000} onChange={(e) => setForm({ ...form, coinEarning: { ...form.coinEarning, resellerPer1000: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Wholesaler coins per ৳1,000</label><input type="number" min="0" step="0.01" value={form.coinEarning.wholesalerPer1000} onChange={(e) => setForm({ ...form, coinEarning: { ...form.coinEarning, wholesalerPer1000: Number(e.target.value) } })} required /></div>

    <h3 style={{ gridColumn: "1 / -1", margin: "12px 0 4px" }}>Coin Redemption (Coin ব্যবহার/মূল্য)</h3>
    <div className="field"><label>Coins (e.g. 100)</label><input type="number" min="1" step="1" value={form.coinRedemption.coins} onChange={(e) => setForm({ ...form, coinRedemption: { ...form.coinRedemption, coins: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Equals BDT (e.g. 5)</label><input type="number" min="0" step="0.01" value={form.coinRedemption.bdt} onChange={(e) => setForm({ ...form, coinRedemption: { ...form.coinRedemption, bdt: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Minimum coins to redeem</label><input type="number" min="0" step="1" value={form.coinRedemption.minRedeemCoins} onChange={(e) => setForm({ ...form, coinRedemption: { ...form.coinRedemption, minRedeemCoins: Number(e.target.value) } })} required /></div>
    <p className="subtle" style={{ gridColumn: "1 / -1", margin: 0 }}>Example: {form.coinRedemption.coins} Coin = ৳{form.coinRedemption.bdt}; minimum redemption {form.coinRedemption.minRedeemCoins} Coin.</p>

    <h3 style={{ gridColumn: "1 / -1", margin: "12px 0 4px" }}>Shopping Reward Voucher Rules</h3>
    <div className="field"><label>Purchase threshold (৳)</label><input type="number" min="0" step="0.01" value={form.voucher.purchaseThreshold} onChange={(e) => setForm({ ...form, voucher: { ...form.voucher, purchaseThreshold: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Voucher amount (৳)</label><input type="number" min="0" step="0.01" value={form.voucher.voucherAmount} onChange={(e) => setForm({ ...form, voucher: { ...form.voucher, voucherAmount: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Voucher expiry (days)</label><input type="number" min="0" step="1" value={form.voucher.expiryDays} onChange={(e) => setForm({ ...form, voucher: { ...form.voucher, expiryDays: Number(e.target.value) } })} required /></div>
    <div className="field"><label>Minimum order amount to use voucher (৳)</label><input type="number" min="0" step="0.01" value={form.voucher.minOrderAmount} onChange={(e) => setForm({ ...form, voucher: { ...form.voucher, minOrderAmount: Number(e.target.value) } })} required /></div>

    <div className="wide" style={{ marginTop: 8 }}><button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Save Coin & Reward Settings"}</button></div>
    <p className="subtle wide" style={{ margin: 0 }}>Note: Settings are stored for future coin/voucher logic. Existing checkout, cart, pricing, and orders are not changed in this phase.</p>
  </form>;
}

function DataTable({ tab, items, update, can, categories, vendors, userRole, userId, setError, setNotice, showAddForm, setShowAddForm, newOffer, setNewOffer, load }: { tab: string; items: Item[]; update: (url: string, method: "PATCH" | "DELETE" | "POST", body?: unknown) => Promise<string | null>; can: (permission: string) => boolean; categories: Category[]; vendors: VendorOption[]; userRole: string; userId: string; setError: (message: string) => void; setNotice: (message: string) => void; showAddForm: boolean; setShowAddForm: (v: boolean) => void; newOffer: { title: { en: string; bn: string }; subtitle: { en: string; bn: string }; link: string; order: number; active: boolean; image: string }; setNewOffer: (v: { title: { en: string; bn: string }; subtitle: { en: string; bn: string }; link: string; order: number; active: boolean; image: string }) => void; load: (t: string) => void }) {
  const [editingProduct, setEditingProduct] = useState<Item | null>(null);
  const [deliveryActors, setDeliveryActors] = useState<DeliveryStaffOption[]>([]);
  const [deliveryAssignees, setDeliveryAssignees] = useState<DeliveryAssigneeOption[]>([]);
  const [auditFrequency, setAuditFrequency] = useState(0);
  const [defaultDeliveryCharge, setDefaultDeliveryCharge] = useState(60);
  const [notificationProviders, setNotificationProviders] = useState<{ emailConfigured: boolean; smsConfigured: boolean } | null>(null);

  useEffect(() => {
    if (!["Bookings", "My bookings"].includes(tab) || !can("manage_bookings")) return;
    let active = true;
    Promise.all([fetch("/api/admin/delivery-settings"), fetch("/api/admin/delivery-staff"), fetch("/api/admin/delivery-assignees")])
      .then(async ([settingsResponse, actorsResponse, assigneesResponse]) => {
        const [settings, staff] = await Promise.all([
          (async()=>{try{return JSON.parse(await settingsResponse.text()||"{}")}catch{return {error:"Server returned an invalid response."}}})() as Promise<{ auditFrequencyPercent?: number; defaultDeliveryCharge?: number; notifications?: { emailConfigured: boolean; smsConfigured: boolean }; error?: string }>,
        (async()=>{try{return JSON.parse(await actorsResponse.text()||"{}")}catch{return {error:"Server returned an invalid response."}}})() as Promise<{ items?: DeliveryStaffOption[]; error?: string }>,
        ]);
        if (!settingsResponse.ok) throw new Error(settings.error || "Could not load delivery settings");
        if (!actorsResponse.ok) throw new Error(staff.error || "Could not load delivery actors");
        const _safeText_assignees = await assigneesResponse.text(); let assignees: { items?: DeliveryAssigneeOption[]; error?: string } = {};
        try { assignees = _safeText_assignees ? JSON.parse(_safeText_assignees) : {}; } catch { assignees = { error: _safeText_assignees?.startsWith("<") ? "Server returned an invalid response." : "Invalid server response" }; }
        if (!assigneesResponse.ok) throw new Error(assignees.error || "Could not load delivery staff");
        if (!active) return;
        setAuditFrequency(settings.auditFrequencyPercent ?? 0);
        setDefaultDeliveryCharge(settings.defaultDeliveryCharge ?? 60);
        setNotificationProviders(settings.notifications ?? null);
        setDeliveryActors(staff.items ?? []);
        setDeliveryAssignees(assignees.items ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load delivery configuration");
      });
    return () => { active = false; };
  }, [tab, can, setError]);

  if (tab === "Product comments") return <div className="product-admin-comments">{items.map((item) => {
    const product = typeof item.product === "object" && item.product ? item.product.title?.en : "";
    return <article className="product-admin-comment" key={item._id}>
      <p className="eyebrow">{product || "Product"} · {item.customerName} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</p>
      <p>{item.message}</p>
      {item.adminReply && <p className="product-comment-reply"><strong>Current reply:</strong> {item.adminReply}</p>}
      <button className="inline-button" onClick={() => {
        const reply = window.prompt("Reply to this customer comment", String(item.adminReply ?? ""));
        if (reply?.trim()) void update(`/api/admin/product-comments/${item._id}`, "PATCH", { reply: reply.trim() });
      }}>{item.adminReply ? "Edit reply" : "Reply to customer"}</button>
    </article>;
  })}{items.length === 0 && <p className="subtle">No customer comments yet.</p>}</div>;

  if (tab === "Delivery staff") return <table className="data-table"><thead><tr><th>Employee ID</th><th>Name / login email</th><th>Phone / address</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map((item) => {
    const endpoint = `/api/admin/delivery-staff/${item._id}`;
    return <tr key={item._id}>
      <td>{String(item.employeeId)}</td>
      <td>{String(item.name)}<br /><span className="subtle">{String(item.email)}</span></td>
      <td>{String(item.phone)}<br /><span className="subtle">{String(item.address)}</span></td>
      <td><span className="status-pill">{String(item.status)}</span></td>
      <td><button className="inline-button" onClick={() => {
        const name = window.prompt("Employee name", String(item.name));
        if (name === null) return;
        const email = window.prompt("Login email", String(item.email));
        if (email === null) return;
        const phone = window.prompt("Phone number", String(item.phone));
        if (phone === null) return;
        const address = window.prompt("Address", String(item.address));
        if (address === null) return;
        const employeeId = window.prompt("Employee ID", String(item.employeeId));
        if (employeeId !== null) void update(endpoint, "PATCH", { name, email, phone, address, employeeId });
      }}>Edit profile</button>
      <button className="inline-button" onClick={() => {
        const status = item.status === "active" ? "inactive" : "active";
        void update(endpoint, "PATCH", { status });
      }}>{item.status === "active" ? "Deactivate" : "Activate"}</button>
      {item.status !== "suspended" && <button className="inline-button" onClick={() => void update(endpoint, "PATCH", { status: "suspended" })}>Suspend</button>}
      </td>
    </tr>;
  })}</tbody></table>;

  if (["Categories", "Banners", "Offers", "Announcements", "Products", "My products", "Featured products"].includes(tab)) {
    const endpoint = tab === "Categories" ? "/api/categories" : tab === "Banners" ? "/api/banners" : tab === "Offers" ? "/api/offers" : tab === "Announcements" ? "/api/announcements" : "/api/products";

    const isSimpleTab = tab === "Offers" || tab === "Announcements";

    return <>
    {isSimpleTab && showAddForm && (
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {tab === "Offers" ? "নতুন অফার যোগ করুন" : "নতুন ঘোষণা যোগ করুন"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ padding: 16 }}>
          <div>
            <label className="form-label">শিরোনাম (ইংরেজি)</label>
            <input
              className="form-input"
              value={newOffer.title.en}
              onChange={(e) => setNewOffer({ ...newOffer, title: { ...newOffer.title, en: e.target.value } })}
              placeholder="যেমন: আজকের অফার"
            />
          </div>
          <div>
            <label className="form-label">শিরোনাম (বাংলা)</label>
            <input
              className="form-input"
              value={newOffer.title.bn}
              onChange={(e) => setNewOffer({ ...newOffer, title: { ...newOffer.title, bn: e.target.value } })}
              placeholder="যেমন: আজকের অফার"
            />
          </div>
          {tab === "Offers" && (
            <>
              <div>
                <label className="form-label">উপশিরোনাম (ইংরেজি)</label>
                <input
                  className="form-input"
                  value={newOffer.subtitle.en}
                  onChange={(e) => setNewOffer({ ...newOffer, subtitle: { ...newOffer.subtitle, en: e.target.value } })}
                  placeholder="৫০% ছাড় পর্যন্ত"
                />
              </div>
              <div>
                <label className="form-label">উপশিরোনাম (বাংলা)</label>
                <input
                  className="form-input"
                  value={newOffer.subtitle.bn}
                  onChange={(e) => setNewOffer({ ...newOffer, subtitle: { ...newOffer.subtitle, bn: e.target.value } })}
                  placeholder="৫০% ছাড় পর্যন্ত"
                />
              </div>
            </>
          )}
          <div>
            <label className="form-label">লিঙ্ক</label>
            <input
              className="form-input"
              value={newOffer.link}
              onChange={(e) => setNewOffer({ ...newOffer, link: e.target.value })}
              placeholder="/products"
            />
          </div>
          <div>
            <label className="form-label">ছবি URL (Cloudinary)</label>
            <input
              className="form-input"
              value={newOffer.image}
              onChange={(e) => setNewOffer({ ...newOffer, image: e.target.value })}
              placeholder="ঐচ্ছিক"
            />
          </div>
          <div>
            <label className="form-label">সর্ট অর্ডার</label>
            <input
              type="number"
              className="form-input"
              value={newOffer.order}
              onChange={(e) => setNewOffer({ ...newOffer, order: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="form-label">সক্রিয় থাকবে?</label>
            <select
              className="form-input"
              value={newOffer.active ? "true" : "false"}
              onChange={(e) => setNewOffer({ ...newOffer, active: e.target.value === "true" })}
            >
              <option value="true">হ্যাঁ</option>
              <option value="false">না</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="button"
              onClick={async () => {
                if (!newOffer.title.en.trim()) {
                  setError("শিরোনাম দরকার");
                  return;
                }
                try {
                  await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newOffer),
                  });
                  setShowAddForm(false);
                  setNewOffer({
                    title: { en: "", bn: "" },
                    subtitle: { en: "", bn: "" },
                    link: "/products",
                    order: 0,
                    active: true,
                    image: "",
                  });
                  setNotice("যোগ করা হলো");
                  void load(tab);
                } catch (err: any) {
                  setError(err?.message ?? "অতিরিক্ত সমস্যা");
                }
              }}
            >
                          যোগ করুন
            </button>
            <button className="inline-button" onClick={() => setShowAddForm(false)}>বাতিল</button>
          </div>
        </div>
      </section>
    )}
    {isSimpleTab && !showAddForm && (
      <button
        className="button"
        onClick={() => setShowAddForm(true)}
        style={{ marginBottom: 12, float: "right" }}
      >
        + নতুন {tab === "Offers" ? "অফার" : "ঘোষণা"} যোগ করুন
      </button>
    )}
    {editingProduct && <ProductEditor
      product={editingProduct}
      categories={categories}
      vendors={vendors}
      userRole={userRole}
      onClose={() => setEditingProduct(null)}
      onSave={(body) => update(`/api/products/${editingProduct._id}`, "PATCH", body)}
    />}
    <table className="data-table"><thead><tr><th>Name</th>{tab === "Offers" && <><th>Subtitle</th><th>Link</th><th>Order</th></>}{tab === "Announcements" && <><th>Link</th><th>Order</th></>}{(tab === "Products" || tab === "My products" || tab === "Featured products") && <><th>Category / options</th><th>Price</th><th>Featured</th></>}<th>Status</th>{tab === "Products" && <th>Approval</th>}<th>Actions</th></tr></thead><tbody>{items.map((item) => {
      const variants = item.variants ?? [];
      const effectivePrice = item.discountPrice ?? item.price;
      const categoryName = typeof item.category === "object" && item.category !== null ? item.category.name?.en : "";
      return <tr key={item._id}>
        <td>{localizedName(item)}</td>
        {tab === "Offers" && <>
          <td>{(item.subtitle as { en?: string } | undefined)?.en ?? ""}</td>
          <td>{item.link ?? ""}</td>
          <td>{item.order ?? 0}</td>
        </>}
        {tab === "Announcements" && <>
          <td>{item.link ?? ""}</td>
          <td>{item.order ?? 0}</td>
        </>}
        {(tab === "Products" || tab === "My products" || tab === "Featured products") && <>
          <td><strong>{categoryName || "—"}</strong><small className="admin-product-unit">{variants.length ? variants.map((variant) => `${variant.label}: ৳${variant.price.toLocaleString("en-BD")} · stock ${variant.stock}`).join(" | ") : `${unitLabel(item.unit)}${item.stock !== undefined ? ` · stock ${item.stock}` : ""}`}</small></td>
          <td>{variants.length ? <><strong>From ৳{Math.min(...variants.map((variant) => variant.price)).toLocaleString("en-BD")}</strong><small className="admin-product-unit">Price varies by option</small></> : effectivePrice === undefined ? "—" : <><strong>৳{effectivePrice.toLocaleString("en-BD")}</strong>{item.discountPrice != null && item.price != null && <small className="admin-product-unit"><del>৳{item.price.toLocaleString("en-BD")}</del> sale / {unitLabel(item.unit)}</small>}{item.discountPrice == null && <small className="admin-product-unit">per {unitLabel(item.unit)}</small>}</>}</td>
          <td>{item.featured ? "Yes" : "No"}{can("manage_featured") && <button className="inline-button" onClick={() => void update(`/api/products/${item._id}`, "PATCH", { featured: !item.featured })}>Toggle</button>}</td>
        </>}
        <td><span className="status-pill">{item.active === false ? "inactive" : "active"}</span></td>
        {tab === "Products" && <td><span className="status-pill">{item.approved === false ? "pending review" : "approved"}</span>{can("manage_products") && <button className="inline-button" onClick={() => void update(`/api/products/${item._id}`, "PATCH", { approved: item.approved === false, active: item.approved === false })}>{item.approved === false ? "Approve" : "Unapprove"}</button>}</td>}
        <td>{tab !== "Featured products" && <button className="inline-button" onClick={() => {
      if (tab === "Categories") {
        const name = item.name as { en?: string; bn?: string };
        const en = window.prompt("Category name in English", name?.en ?? "");
        if (en === null) return;
        const bn = window.prompt("Category name in Bangla", name?.bn ?? "");
        if (bn === null) return;
        const parentCategory = window.prompt("Parent category ID (optional; leave blank for none)", String(item.parentCategory ?? ""));
        if (parentCategory === null) return;
        const order = window.prompt("Order / Priority", String(item.order ?? 0));
        if (order === null) return;
        const isFeatured = window.prompt("Show in homepage category strip? (yes/no)", item.isFeatured ? "yes" : "no");
        if (isFeatured === null) return;
        const image = window.prompt("Cloudinary image/icon URL (leave blank to remove)", item.image ?? "");
        if (image !== null) void update(`${endpoint}/${item._id}`, "PATCH", {
          name: { en, bn },
          parentCategory: parentCategory.trim() || undefined,
          order: Number(order),
          isFeatured: /^y(es)?|true|1$/i.test(isFeatured.trim()),
          image: image.trim(),
        });
      } else if (tab === "Banners") {
        const title = item.title as { en?: string; bn?: string };
        const en = window.prompt("Banner title in English", title?.en ?? "");
        if (en === null) return;
        const bn = window.prompt("Banner title in Bangla", title?.bn ?? "");
        if (bn === null) return;
        const subtitle = item.subtitle as { en?: string; bn?: string };
        const subtitleEn = window.prompt("Banner subtitle in English", subtitle?.en ?? "");
        if (subtitleEn === null) return;
        const subtitleBn = window.prompt("Banner subtitle in Bangla", subtitle?.bn ?? "");
        if (subtitleBn === null) return;
        const button = item.buttonText as { en?: string; bn?: string } | undefined;
        const buttonEn = window.prompt("Shop Now button text in English (optional)", button?.en ?? "");
        if (buttonEn === null) return;
        const buttonBn = window.prompt("Shop Now button text in Bangla (optional)", button?.bn ?? "");
        if (buttonBn === null) return;
        const bgColor = window.prompt("Background color (optional: #hex, CSS color, or gradient; leave blank for default #020617)", String(item.bgColor ?? ""));
        if (bgColor === null) return;
        const link = window.prompt("Destination link (optional: relative path or HTTPS URL; leave blank for no redirect)", item.link ?? "");
        if (link === null) return;
        const order = window.prompt("Sort order", String(item.order ?? 0));
        if (order === null) return;
        const startDate = window.prompt("Start date (optional, ISO or YYYY-MM-DDTHH:mm; leave blank to clear)", String(item.startDate ?? ""));
        if (startDate === null) return;
        const endDate = window.prompt("End date (optional, ISO or YYYY-MM-DDTHH:mm; leave blank to clear)", String(item.endDate ?? ""));
        if (endDate === null) return;
        const image = window.prompt("Cloudinary image URL", String(item.image ?? ""));
        if (image !== null) void update(`${endpoint}/${item._id}`, "PATCH", {
          title: { en, bn },
          subtitle: { en: subtitleEn, bn: subtitleBn },
          buttonText: buttonEn.trim() ? { en: buttonEn.trim(), bn: buttonBn.trim() } : { en: "", bn: "" },
          bgColor: bgColor.trim() || undefined,
          link: link.trim(),
          order: Number(order),
          startDate: startDate.trim() || undefined,
          endDate: endDate.trim() || undefined,
          ...(image.trim() ? { image: image.trim() } : {}),
        });
      } else if (tab === "Offers") {
        const offerTitle = item.title as { en?: string; bn?: string };
        const en = window.prompt("Offer title in English", offerTitle?.en ?? "");
        if (en === null) return;
        const bn = window.prompt("Offer title in Bangla", offerTitle?.bn ?? "");
        if (bn === null) return;
        const offerSubtitle = item.subtitle as { en?: string; bn?: string };
        const subtitleEn = window.prompt("Offer subtitle in English", offerSubtitle?.en ?? "");
        if (subtitleEn === null) return;
        const subtitleBn = window.prompt("Offer subtitle in Bangla", offerSubtitle?.bn ?? "");
        if (subtitleBn === null) return;
        const link = window.prompt("Destination link (relative path or HTTPS URL)", item.link ?? "/products");
        if (link === null) return;
        const order = window.prompt("Sort order", String(item.order ?? 0));
        if (order === null) return;
        const image = window.prompt("Cloudinary image URL", String(item.image ?? ""));
        if (image !== null) void update(`${endpoint}/${item._id}`, "PATCH", { title: { en, bn }, subtitle: { en: subtitleEn, bn: subtitleBn }, link, order: Number(order), ...(image.trim() ? { image: image.trim() } : {}) });
      } else if (tab === "Announcements") {
        const annTitle = item.title as { en?: string; bn?: string };
        const en = window.prompt("Announcement title in English", annTitle?.en ?? "");
        if (en === null) return;
        const bn = window.prompt("Announcement title in Bangla", annTitle?.bn ?? "");
        if (bn === null) return;
        const link = window.prompt("Destination link (relative path or HTTPS URL)", item.link ?? "/products");
        if (link === null) return;
        const order = window.prompt("Sort order", String(item.order ?? 0));
        if (order === null) return;
        void update(`${endpoint}/${item._id}`, "PATCH", { title: { en, bn }, link, order: Number(order) });
      } else {
        setEditingProduct(item);
      }
    }}>{tab === "Categories" || tab === "Banners" || tab === "Offers" || tab === "Announcements" ? "Edit" : "Edit product"}</button>}{tab !== "Featured products" && tab !== "My products" && <button className="inline-button" onClick={() => void update(`${endpoint}/${item._id}`, "PATCH", { active: item.active === false })}>{item.active === false ? "Activate" : "Deactivate"}</button>}{tab !== "Featured products" && <button className="inline-button" onClick={() => { if (window.confirm("Delete this item?")) void update(`${endpoint}/${item._id}`, "DELETE"); }}>Delete</button>}</td></tr>;
    })}</tbody></table></>;
  }
  if (["Bookings", "My bookings"].includes(tab)) {
    const staffStats = new Map<string, { delivered: number; failed: number; complaints: number }>();
    for (const order of items) {
      const delivery = order.delivery;
      const deliveryEvents = order.deliveryAudit?.filter((entry) => entry.event === "delivery_delivered" || entry.event === "delivery_failed") ?? [];
      const actors = new Set([
        ...deliveryEvents.map((entry) => entry.actorId),
        delivery?.deliveredBy,
        delivery?.failedBy,
      ].filter((actor): actor is string => Boolean(actor)));
      for (const actor of actors) {
        const stats = staffStats.get(actor) ?? { delivered: 0, failed: 0, complaints: 0 };
        const actorEvents = deliveryEvents.filter((entry) => entry.actorId === actor);
        if (actorEvents.length) {
          stats.delivered += actorEvents.filter((entry) => entry.event === "delivery_delivered").length;
          stats.failed += actorEvents.filter((entry) => entry.event === "delivery_failed").length;
        } else {
          if (delivery?.deliveredBy === actor && order.status === "delivered") stats.delivered += 1;
          if (delivery?.failedBy === actor && order.status === "failed") stats.failed += 1;
        }
        stats.complaints += delivery?.reports?.length ?? 0;
        staffStats.set(actor, stats);
      }
    }
    return <><p className="delivery-review-note">Delivery pattern flags are review signals only; they do not automatically penalize staff. Items and cash are counted as received only after admin verification or physical settlement.</p>
    {can("manage_bookings") && <section className="delivery-admin-settings" aria-label="Delivery settings">
      <label>Automatic audit sampling (%)
        <input type="number" min="0" max="100" step="1" value={auditFrequency} onChange={(event) => setAuditFrequency(Number(event.target.value))} />
      </label>
      <button className="button-secondary" onClick={() => void update("/api/admin/delivery-settings", "PATCH", { auditFrequencyPercent: auditFrequency })}>Save audit frequency</button>
      <p>Each order is sampled at most once after a successful delivery update. Sampling creates an admin review request only.</p>
      <p>In-site notifications: available · Email provider: {notificationProviders?.emailConfigured ? "configured (sending not enabled)" : "not configured"} · SMS provider: {notificationProviders?.smsConfigured ? "configured (sending not enabled)" : "not configured"}</p>
    </section>}
    <table className="data-table"><thead><tr><th>Order</th><th>Customer / items</th><th>Total</th><th>Status / verification</th><th>Delivery management</th></tr></thead><tbody>{items.map((item) => {
    const itemLines = item.items ?? [];
    const possible = statuses.filter((next) => {
      const eligible = itemLines.filter((line) => canMove(line.status, next));
      return tab === "My bookings" ? eligible.length > 0 : itemLines.length > 0 && eligible.length === itemLines.length;
    });
    const canManage = tab === "My bookings" || can("manage_bookings");
    const customer = item.customerInfo;
    const delivery = item.delivery;
    const assignedStaff = deliveryAssignees.find((staff) => staff.id === delivery?.assignment?.assignedTo);
    const openReports = delivery?.reports?.filter((report) => report.status === "open") ?? [];
    const pendingReturns = delivery?.returns?.filter((receipt) => receipt.status === "pending_confirmation") ?? [];
    const handovers = delivery?.handovers ?? [];
    const staffIds = new Set([delivery?.deliveredBy, delivery?.failedBy].filter((actor): actor is string => Boolean(actor)));
    const riskFlags = [...staffIds].flatMap((actor) => {
      const stats = staffStats.get(actor);
      if (!stats) return [];
      const outcomes = stats.delivered + stats.failed;
      return [
        ...(outcomes >= 20 && stats.delivered / outcomes >= 0.98 ? ["Unusually high delivery success rate"] : []),
        ...(stats.complaints >= 3 ? ["Repeated customer complaints"] : []),
      ];
    });
    const hasShippedItems = itemLines.some((line) => line.status === "shipped");
    const hasRetryItems = itemLines.some((line) => line.status === "failed");
    const canAssignOrder = (item.status === "shipped" || item.status === "failed") && itemLines.length > 0 && itemLines.every((line) => line.status === "shipped" || line.status === "failed");
    const canDeliver = canManage && (hasShippedItems || hasRetryItems);
    const deliveryEndpoint = `/api/orders/${item._id}/delivery`;
    return <tr key={item._id}><td>#{item._id.slice(-8).toUpperCase()}<br />{item.deliveryAuditValid === false && <span className="delivery-flag">Audit history integrity check failed</span>}</td><td>{customer && <><strong>{customer.name}</strong><br />{customer.phone}<br />{[customer.address, customer.area, customer.union, customer.upazila, customer.district, customer.division].filter(Boolean).join(", ")}<br /></>}{itemLines.map((line) => `${line.title}${line.variantLabel ? ` (${line.variantLabel})` : ""} × ${line.quantity} ${unitLabel(line.unit)} · ৳${Number(line.unitPrice ?? 0).toLocaleString("en-BD")} each · ৳${(Number(line.unitPrice ?? 0) * Number(line.quantity ?? 0)).toLocaleString("en-BD")} total (${line.status})`).join(", ")}{riskFlags.map((flag) => <span className="delivery-flag" key={flag}>{flag}</span>)}</td><td>৳{Number(item.total ?? 0).toLocaleString("en-BD")}</td><td><span className="status-pill">{item.status}</span><br />{delivery?.assignment && <span className="delivery-meta">Assigned to {assignedStaff ? `${assignedStaff.name} (${assignedStaff.employeeId})` : delivery.assignment.assignedTo}</span>}<span className="delivery-meta">Admin verification: {delivery?.verificationStatus ?? "not_required"}</span>{item.deliveryAuditProtection && <span className="delivery-meta">Audit protection: {item.deliveryAuditProtection}</span>}{delivery?.deliveredAt && <span className="delivery-meta">Delivered {new Date(delivery.deliveredAt).toLocaleString()} · staff {delivery.deliveredBy}</span>}{delivery?.failedReason && <span className="delivery-meta">Failed: {delivery.failedReason}</span>}{delivery?.notes && <span className="delivery-meta">Note: {delivery.notes}</span>}{handovers.map((handover) => {
      const remaining = Math.max(0, handover.acceptedQuantity - handover.verifiedDeliveredQuantity - handover.returnedQuantity - handover.missingQuantity - handover.disputedQuantity);
      return <div className="delivery-ledger" key={handover._id}>
        <strong>{handover.title} · assigned to {handover.assignedTo}</strong>
        <span>Assigned {handover.assignedQuantity} · accepted {handover.acceptedQuantity} · delivered reported {handover.deliveredQuantity} · verified delivered {handover.verifiedDeliveredQuantity}</span>
        <span>Physically returned {handover.returnedQuantity} · remaining {remaining} · missing {handover.missingQuantity} · disputed {handover.disputedQuantity}</span>
        <span>COD due ৳{handover.codDue.toLocaleString("en-BD")} · reported collected ৳{handover.codCollected.toLocaleString("en-BD")} · physically settled ৳{handover.codSettled.toLocaleString("en-BD")} · discrepancy ৳{handover.codDisputed.toLocaleString("en-BD")}</span>
        {handover.assignedTo === userId && !handover.acceptedAt && <button className="inline-button" onClick={() => { const quantity = window.prompt(`Physical quantity accepted for ${handover.title}`, String(handover.assignedQuantity)); if (quantity !== null) void update(deliveryEndpoint, "POST", { action: "accept_handover", handoverId: handover._id, acceptedQuantity: Number(quantity) }); }}>Accept physical handover</button>}
        {handover.assignedTo === userId && Boolean(handover.acceptedAt) && <button className="inline-button" onClick={() => { const amount = window.prompt(`COD physically collected so far (due ৳${handover.codDue})`, String(handover.codCollected)); if (amount !== null) void update(deliveryEndpoint, "POST", { action: "record_cod_collection", handoverId: handover._id, amount: Number(amount) - handover.codCollected }); }}>Record COD collection</button>}
        {can("manage_bookings") && <><button className="inline-button" onClick={() => { const quantity = window.prompt(`Verified delivered quantity (reported: ${handover.deliveredQuantity})`, String(handover.deliveredQuantity)); if (quantity !== null) void update(deliveryEndpoint, "POST", { action: "verify_handover", handoverId: handover._id, verifiedQuantity: Number(quantity) }); }}>Verify delivered quantity</button><button className="inline-button" onClick={() => { const missing = window.prompt("Additional missing quantity", "0"); if (missing === null) return; const disputed = window.prompt("Additional disputed quantity", "0"); if (disputed !== null) void update(deliveryEndpoint, "POST", { action: "reconcile_handover", handoverId: handover._id, missingQuantity: Number(missing), disputedQuantity: Number(disputed) }); }}>Reconcile quantity</button><button className="inline-button" onClick={() => { const amount = window.prompt(`Physical COD amount received (reported: ৳${handover.codCollected})`, String(handover.codCollected)); if (amount !== null) void update(deliveryEndpoint, "POST", { action: "settle_cod", handoverId: handover._id, amount: Number(amount) }); }}>Settle COD physically</button></>}
      </div>;
    })}{openReports.map((report) => <span className="delivery-flag" key={report._id}>Customer report: {report.reason}{report.details ? ` — ${report.details}` : ""}</span>)}{item.deliveryAudit && item.deliveryAudit.length > 0 && <details className="delivery-audit-history"><summary>Audit history ({item.deliveryAudit.length})</summary><ol>{item.deliveryAudit.map((entry, index) => <li key={`${entry.hash}-${index}`}><strong>{entry.event}</strong><span>{new Date(entry.occurredAt).toLocaleString()} · {entry.actorRole} {entry.actorId}</span>{entry.details && <span>{entry.details}</span>}<code>{entry.hash}</code></li>)}</ol></details>}</td><td>{canManage ? <><select defaultValue="" aria-label="Update order status" onChange={(event) => { if (event.target.value) void update(`/api/orders/${item._id}`, "PATCH", { status: event.target.value }); }}><option value="">Order status</option>{possible.map((status) => <option key={status} value={status}>{status}</option>)}</select><div className="delivery-actions">
      {can("manage_bookings") && canAssignOrder && handovers.length === 0 && deliveryAssignees.length > 0 && <button className="inline-button" onClick={() => {
        const staffIndex = window.prompt(`Assign this order to which delivery staff member?\n${deliveryAssignees.map((staff, index) => `${index + 1}) ${staff.name} (${staff.employeeId})`).join("\n")}`);
        if (staffIndex === null) return;
        const staff = deliveryAssignees[Number(staffIndex) - 1];
        if (!staff) { setError("Choose a valid delivery staff number."); return; }
        void update(`/api/admin/orders/${item._id}/delivery-assignment`, "PATCH", { deliveryStaffId: staff.id });
      }}>{delivery?.assignment ? "Reassign order" : "Assign order"}</button>}
      {can("manage_bookings") && deliveryActors.length > 0 && itemLines.filter((line) => line.status === "shipped" && line.productId).map((line) => <button className="inline-button" key={`assign-${line.productId}-${line.variantId ?? ""}`} onClick={() => {
        const staffIndex = window.prompt(`Assign ${line.title} to which delivery actor?\n${deliveryActors.map((staff, index) => `${index + 1}) ${staff.name} (${staff.role})`).join("\n")}`);
        if (staffIndex === null) return;
        const staff = deliveryActors[Number(staffIndex) - 1];
        if (!staff) { setError("Choose a valid delivery actor number."); return; }
        const alreadyAssigned = handovers.filter((handover) => handover.productId === line.productId && handover.variantId === line.variantId).reduce((sum, handover) => sum + handover.assignedQuantity, 0);
        const quantity = window.prompt(`Quantity to assign (remaining: ${line.quantity - alreadyAssigned})`, String(line.quantity - alreadyAssigned));
        if (quantity !== null) void update(deliveryEndpoint, "POST", { action: "assign_handover", productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}), assignedTo: staff.id, assignedQuantity: Number(quantity) });
      }}>Assign {line.title}</button>)}
      {canDeliver && <>{(hasShippedItems || hasRetryItems) && <button className="inline-button" onClick={() => { const notes = window.prompt("Optional delivery notes", ""); if (notes === null) return; void update(deliveryEndpoint, "POST", { action: "delivered", notes, notifyCustomer: window.confirm("Send an in-site delivery notification to the customer?") }); }}>{hasRetryItems ? "Retry delivery / mark delivered" : "Mark delivered"}</button>}{hasShippedItems && <button className="inline-button" onClick={() => { const reason = window.prompt("Required reason for failed delivery"); if (reason?.trim()) void update(deliveryEndpoint, "POST", { action: "failed", reason: reason.trim() }); }}>Mark failed</button>}</>}
      {can("manage_bookings") && <><button className="inline-button" onClick={() => { const reason = window.prompt("Reason for requesting admin verification or audit"); if (reason?.trim()) void update(deliveryEndpoint, "POST", { action: "request_verification", reason: reason.trim() }); }}>Request audit</button>{delivery?.verificationStatus === "pending" && <><button className="inline-button" onClick={() => void update(deliveryEndpoint, "POST", { action: "verify", status: "verified" })}>Verify delivery</button><button className="inline-button" onClick={() => { const notes = window.prompt("Reason for flagging this delivery"); if (notes?.trim()) void update(deliveryEndpoint, "POST", { action: "verify", status: "flagged", notes: notes.trim() }); }}>Flag delivery</button></>}</>}
      {canManage && itemLines.some((line) => line.status === "delivered" || line.status === "failed") && <button className="inline-button" onClick={() => { const counted = []; for (const line of itemLines.filter((entry) => entry.status === "delivered" || entry.status === "failed")) { if (!line.productId) { setError("Order product details are unavailable for return counting."); return; } const value = window.prompt(`Physical count received for ${line.title} (ordered: ${line.quantity})`, String(line.quantity)); if (value === null) return; const quantity = Number(value); if (!Number.isFinite(quantity) || quantity < 0 || quantity > line.quantity) { setError(`Enter a physical count from 0 to ${line.quantity} for ${line.title}.`); return; } if (quantity > 0) counted.push({ productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}), countedQuantity: quantity }); } if (!counted.length) { setError("At least one returned product must be physically counted."); return; } const notes = window.prompt("Optional return receipt notes", ""); if (notes !== null) void update(deliveryEndpoint, "POST", { action: "record_return", items: counted, notes }); }}>Record physical return</button>}
      {can("manage_bookings") && pendingReturns.map((receipt) => <button className="inline-button" key={receipt._id} onClick={() => { const condition = window.prompt(`Inspect returned item condition for ${receipt.title}: good / damaged / disputed`, "good"); if (condition && ["good", "damaged", "disputed"].includes(condition)) void update(deliveryEndpoint, "POST", { action: "confirm_return", returnId: receipt._id, condition }); else if (condition !== null) setError("Choose good, damaged, or disputed. Only good items are restocked."); }}>Inspect and confirm return: {receipt.title} ({receipt.countedQuantity}/{receipt.expectedQuantity})</button>)}
      {can("manage_bookings") && openReports.map((report) => <button className="inline-button" key={report._id} onClick={() => { if (window.confirm("Mark this customer delivery report as reviewed and resolved?")) void update(deliveryEndpoint, "POST", { action: "resolve_report", reportId: report._id }); }}>Resolve report: {report.reason}</button>)}
      </div></> : <span className="subtle">View only</span>}</td></tr>;
  })}</tbody></table></>;
  }
  if (tab === "Vendor applications") return <table className="data-table"><thead><tr><th>Type</th><th>Shop / contact</th><th>Details / documents</th><th>Status</th><th>Decision</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td><span className="status-pill">{String((item as Record<string, unknown>).applicationType ?? "vendor")}</span></td><td>{String(item.shopName)}<br />{String(item.email)}</td><td>{String(item.name)} · {String(item.phone)}<br />{String(item.address)}{(item as Record<string, unknown>).tradeLicense ? <><br />Trade license: {String((item as Record<string, unknown>).tradeLicense)}</> : null}<br />{Array.isArray(item.documents) && item.documents.map((document, index) => <a className="inline-button" key={String(document)} href={String(document)} target="_blank" rel="noreferrer">Document {index + 1}</a>)}</td><td>{String(item.status)}</td><td>{item.status === "pending" && <><button className="inline-button" onClick={() => void update(`/api/vendor-applications/${item._id}`, "PATCH", { status: "approved" })}>Approve</button><button className="inline-button" onClick={() => void update(`/api/vendor-applications/${item._id}`, "PATCH", { status: "rejected" })}>Reject</button></>}</td></tr>)}</tbody></table>;
  if (tab === "Messages") return <table className="data-table"><thead><tr><th>From</th><th>Subject</th><th>Message</th><th>Date</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td>{String(item.name)}<br />{String(item.email)}</td><td>{String(item.subject)}</td><td>{String(item.message)}</td><td>{new Date(String(item.createdAt)).toLocaleDateString()}</td></tr>)}</tbody></table>;
  if (tab === "Admin users") return <table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Permissions</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td>{String(item.name)}</td><td>{String(item.email)}</td><td>{Array.isArray(item.permissions) ? item.permissions.map(String).join(", ") : ""}</td><td>{String(item.status)}</td><td><button className="inline-button" onClick={() => {
    const current = Array.isArray(item.permissions) ? item.permissions.map(String).join(", ") : "";
    const value = window.prompt(`Enter permission names separated by commas:\n${permissionOptions.map(([permission]) => permission).join(", ")}`, current);
    if (value !== null) void update(`/api/admin/users/${item._id}`, "PATCH", { permissions: value.split(",").map((permission) => permission.trim()).filter(Boolean) });
  }}>Edit permissions</button><button className="inline-button" onClick={() => void update(`/api/admin/users/${item._id}`, "PATCH", { status: item.status === "active" ? "inactive" : "active" })}>{item.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table>;
  return items.length ? <pre>{JSON.stringify(items, null, 2)}</pre> : <p className="subtle">Nothing to show yet.</p>;
}

function localizedName(item: Item) {
  const value = item.name ?? item.title;
  if (typeof value === "object" && value !== null) return String(value.en ?? "Untitled");
  return String(value ?? item.slug ?? "Untitled");
}

function canMove(current: string, next: string) {
  const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered", "cancelled"], delivered: [], cancelled: [] };
  return transitions[current]?.includes(next) ?? false;
}


function RewardsVouchersMonitor() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ user: "", action: "add" as "add" | "deduct", coins: 0, description: "" });

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/rewards-overview");
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { throw new Error(text?.startsWith("<") ? "Server returned an invalid response (rewards overview)." : "Invalid server response"); }
      if (!res.ok) throw new Error(json.error || "Could not load rewards overview");
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load rewards overview"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function submitAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setNotice("");
    if (!form.user.trim()) return setError("User email or ID is required.");
    if (!Number.isInteger(form.coins) || form.coins <= 0) return setError("Coins must be a positive integer.");
    if (form.description.trim().length < 3) return setError("Description must be at least 3 characters.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/wallet-adjust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: form.user.trim(), action: form.action, coins: form.coins, description: form.description.trim() }) });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { throw new Error(text?.startsWith("<") ? "Server returned an invalid response (wallet adjust)." : "Invalid server response"); }
      if (!res.ok) throw new Error(json.error || "Could not adjust wallet");
      setNotice(`Wallet updated for ${json.user?.email || form.user}. New balance: ${json.wallet?.balanceCoins ?? 0} coins.`);
      setForm({ user: "", action: "add", coins: 0, description: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not adjust wallet"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="dashboard-card"><p className="subtle">Loading rewards overview…</p></div>;
  return <div className="stack">
    <div className="dashboard-card stack"><h2>Rewards &amp; Vouchers Monitor</h2><p className="subtle">Super-admin overview of coin circulation, vouchers, and business accounts.</p>
      {error && <p className="form-error">{error}</p>}{notice && <p style={{ color: "#166534" }}>{notice}</p>}
      <div className="dashboard-grid">
        <div className="dashboard-card"><h3>Coins</h3><p><strong>Total earned:</strong> {Number(data?.coins?.totalEarned || 0).toLocaleString("en-BD")}</p><p><strong>Total redeemed:</strong> {Number(data?.coins?.totalRedeemed || 0).toLocaleString("en-BD")}</p><p><strong>Total balance (wallets):</strong> {Number(data?.coins?.totalBalance || 0).toLocaleString("en-BD")}</p></div>
        <div className="dashboard-card"><h3>Vouchers</h3><p><strong>Active:</strong> {data?.vouchers?.active?.count || 0} (৳{Number(data?.vouchers?.active?.amount || 0).toLocaleString("en-BD")})</p><p><strong>Used:</strong> {data?.vouchers?.used?.count || 0} (৳{Number(data?.vouchers?.used?.amount || 0).toLocaleString("en-BD")})</p><p><strong>Expired:</strong> {data?.vouchers?.expired?.count || 0} (৳{Number(data?.vouchers?.expired?.amount || 0).toLocaleString("en-BD")})</p></div>
        <div className="dashboard-card"><h3>Business accounts</h3><p><strong>Active resellers:</strong> {data?.roles?.activeResellers || 0}</p><p><strong>Active wholesalers:</strong> {data?.roles?.activeWholesalers || 0}</p></div>
      </div>
    </div>

    <div className="dashboard-card stack"><h3>Manual Coin Adjustment</h3><p className="subtle">Adjust a user wallet by email or user ID. Deduction cannot make balance negative. Recorded as admin_adjust.</p>
      <form className="form-grid" onSubmit={submitAdjust}>
        <label className="field">User (email or ID)<input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} required maxLength={254} /></label>
        <label className="field">Action<select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as "add" | "deduct" })}><option value="add">Add coins</option><option value="deduct">Deduct coins</option></select></label>
        <label className="field">Coins<input type="number" min={1} step={1} value={form.coins} onChange={(e) => setForm({ ...form, coins: Math.max(0, Math.floor(Number(e.target.value || 0))) })} required /></label>
        <label className="field wide">Reason / description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} maxLength={500} /></label>
        <div className="wide"><button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Apply adjustment"}</button></div>
      </form>
    </div>

    <div className="dashboard-card stack"><h3>Recent coin transactions</h3>
      <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Time</th><th>User</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead><tbody>
        {(data?.recentTransactions || []).length === 0 ? <tr><td colSpan={5} className="subtle">No transactions.</td></tr> : (data.recentTransactions || []).map((tx: any) => <tr key={tx._id}><td>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "-"}</td><td>{tx.user ? `${tx.user.name || ""} (${tx.user.email || ""})` : "-"}</td><td>{tx.type}</td><td style={{ color: tx.amount < 0 ? "#b91c1c" : "#166534" }}>{tx.amount > 0 ? "+" : ""}{tx.amount}</td><td>{tx.description || "-"}</td></tr>)}
      </tbody></table></div>
    </div>

    <div className="dashboard-card stack"><h3>Recent issued vouchers</h3>
      <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Code</th><th>User</th><th>Amount</th><th>Min order</th><th>Status</th><th>Expires</th></tr></thead><tbody>
        {(data?.recentVouchers || []).length === 0 ? <tr><td colSpan={6} className="subtle">No vouchers.</td></tr> : (data.recentVouchers || []).map((v: any) => <tr key={v._id}><td><strong>{v.voucherCode}</strong></td><td>{v.user ? `${v.user.name || ""} (${v.user.email || ""})` : "-"}</td><td>৳{Number(v.amount || 0).toLocaleString("en-BD")}</td><td>৳{Number(v.minOrderAmount || 0).toLocaleString("en-BD")}</td><td>{v.status}</td><td>{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "-"}</td></tr>)}
      </tbody></table></div>
    </div>
  </div>;
}
