"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  approved?: boolean; customerInfo?: { name?: string; phone?: string; address?: string; notes?: string };
  unit?: string; variants?: { _id?: string; label: string; price: number; stock: number }[];
  items?: { title: string; variantLabel?: string; unit?: string; unitPrice?: number; quantity: number; status: string }[];
};
type Category = { _id: string; name: { en: string; bn: string }; slug: string };
type VendorOption = { id: string; name: string; email: string };
type ProductVariantDraft = { label: string; price: string; stock: string };
const permissionOptions = [
  ["manage_categories", "Categories"], ["manage_banners", "Banners"], ["manage_products", "Products"],
  ["manage_featured", "Featured products"], ["view_bookings", "View bookings"], ["manage_bookings", "Manage bookings"],
  ["manage_vendors", "Vendor applications"], ["view_messages", "Contact messages"],
];
const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

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

  const can = useCallback((permission: string) => user?.role === "super_admin" || (user?.role === "admin" && user.permissions.includes(permission)), [user]);
  const menu = useMemo(() => {
    if (!user) return [];
    if (user.role === "vendor") return ["Overview", "My products", "My bookings", "Profile"];
    const choices: [string, string][] = [["Categories", "manage_categories"], ["Banners", "manage_banners"], ["Products", "manage_products"], ["Featured products", "manage_featured"], ["Bookings", "view_bookings"], ["Vendor applications", "manage_vendors"], ["Messages", "view_messages"]];
    return ["Overview", ...choices.filter(([, permission]) => can(permission)).map(([label]) => label), ...(user.role === "super_admin" ? ["Admin users"] : []), "Profile"];
  }, [user, can]);

  const load = useCallback(async (target: string) => {
    setError(""); setNotice(""); setLoading(true);
    try {
      if (target === "Overview") {
        if (kind === "admin") {
          const response = await fetch("/api/admin/summary");
          const data = await response.json() as Record<string, number> & { error?: string };
          if (!response.ok) throw new Error(data.error || "Could not load dashboard");
          setCounts(data);
        } else {
          const [products, orders] = await Promise.all([fetch("/api/products?limit=1"), fetch("/api/orders")]);
          const productData = await products.json() as { total?: number };
          const orderData = await orders.json() as { items?: Item[] };
          setCounts({ products: productData.total ?? 0, bookings: orderData.items?.length ?? 0 });
        }
        setItems([]);
        return;
      }
      if (target === "Profile") { setItems([]); return; }
      if (target === "Categories") {
        const response = await fetch("/api/categories?all=true");
        const data = await response.json() as { items?: Category[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load categories");
        setCategories(data.items ?? []); setItems(data.items as unknown as Item[] ?? []); return;
      }
      const endpoints: Record<string, string> = {
        Banners: "/api/banners?all=true", Products: "/api/products?all=true&limit=100",
        "My products": "/api/products?all=true&limit=100", "Featured products": "/api/products?all=true&limit=100",
        Bookings: "/api/orders", "My bookings": "/api/orders", "Vendor applications": "/api/vendor-applications",
        Messages: "/api/contact", "Admin users": "/api/admin/users",
      };
      const response = await fetch(endpoints[target] ?? "");
      const data = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load this section");
      setItems(data.items ?? []);
      if (target === "Products" || target === "My products") {
        const [categoriesResponse, vendorsResponse] = await Promise.all([fetch("/api/categories"), fetch("/api/admin/vendors")]);
        if (categoriesResponse.ok) setCategories((await categoriesResponse.json() as { items?: Category[] }).items ?? []);
        if (vendorsResponse.ok) setVendors((await vendorsResponse.json() as { items?: VendorOption[] }).items ?? []);
      }
    } catch (reason) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Could not load this section");
    } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => {
    fetch("/api/auth/me").then(async (response) => {
      const data = await response.json() as { user?: UserInfo };
      if (!data.user || (kind === "vendor" ? data.user.role !== "vendor" : !["admin", "super_admin"].includes(data.user.role))) {
        router.replace("/account"); return;
      }
      setUser(data.user);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not verify access")).finally(() => setLoading(false));
  }, [kind, router]);
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
        body = { name: text("name"), image, active: form.get("active") === "on" };
      } else if (tab === "Banners") {
        if (!image) throw new Error("Upload a banner image before adding the banner.");
        endpoint = "/api/banners";
        body = { title: text("title"), subtitle: text("subtitle"), image, link: form.get("link"), order: Number(form.get("order") || 0), active: form.get("active") === "on" };
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
        };
      } else if (tab === "Admin users") {
        endpoint = "/api/admin/users";
        body = { name: form.get("name"), email: form.get("email"), password: form.get("password"), permissions: selectedPermissions };
      } else {
        return;
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      };
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
      formElement.reset(); setImage(""); setImages([]); setProductVariants([]); setProductUnit("piece"); setSelectedProductCategory(""); setSelectedPermissions([]);
      await load(tab);
      setNotice("Saved successfully.");
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

  async function update(url: string, method: "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
    setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const result = await response.json() as { error?: string; temporaryPassword?: string };
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

    setProductUnit(preset.unit);
    setProductVariants((current) => preset.options.map((label) => {
      const existing = current.find((variant) => variant.label.trim().toLowerCase() === label.toLowerCase());
      return existing ?? { label, price: "", stock: "" };
    }));
  }

  const title = kind === "admin" ? "Store administration" : "Vendor studio";
  if (loading && !user) return <div className="page-shell">Loading dashboard…</div>;
  return <div className="page-shell dashboard-page">
    <header className="dashboard-heading">
      <div><p className="eyebrow">ESHOP WORKSPACE</p><h1>{title}</h1><p>{kind === "admin" ? "Manage your store, products, and orders in one place." : "Manage your listings, orders, and vendor profile in one place."}</p></div>
      <span className="dashboard-role">{user?.role.replace("_", " ")}</span>
    </header>
    <div className="dashboard-layout">
      <aside className="dashboard-nav">
        <p className="dashboard-nav-label">WORKSPACE</p>
        {menu.map((item) => <button type="button" key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item}</button>)}
        <button type="button" className="dashboard-signout" onClick={async () => { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) { setError("Could not sign out. Please try again."); return; } window.dispatchEvent(new Event("eshop:auth-changed")); router.replace("/account"); }}>Sign out</button>
      </aside>
      <section className="dashboard-card">
        <div className="dashboard-card-heading"><div><p>MANAGE YOUR STORE</p><h2>{tab}</h2></div></div>
        {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
        {loading ? <p className="subtle">Loading…</p> : tab === "Overview" ? <div className="stat-grid">{Object.entries(counts).map(([key, value]) => <div className="stat-card" key={key}><span>{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{value}</strong></div>)}</div>
          : tab === "Profile" ? user?.role === "vendor" ? <VendorProfile /> : <div><p><strong>{user?.name}</strong></p><p>{user?.email}</p><p className="subtle">Role: {user?.role}</p></div>
          : <>
            {["Categories", "Banners", "Products", "My products", "Admin users"].includes(tab) && <form className="admin-form" onSubmit={submitForm}>
              {tab === "Categories" && <>
                <div className="field"><label>Category name (English)</label><input name="nameEn" required maxLength={200} /></div><div className="field"><label>Category name (বাংলা)</label><input name="nameBn" maxLength={200} /></div>
                <div className="field wide"><label>Category image</label><input type="file" accept="image/*" onChange={(event) => uploadFile(event)} />{image && <small className="subtle">Image uploaded</small>}</div>
                <label className="admin-check"><input type="checkbox" name="active" defaultChecked /> Active</label>
              </>}
              {tab === "Banners" && <>
                <div className="field"><label>Title (English)</label><input name="titleEn" required maxLength={500} /></div><div className="field"><label>Title (বাংলা)</label><input name="titleBn" maxLength={500} /></div>
                <div className="field"><label>Subtitle (English)</label><input name="subtitleEn" required maxLength={500} /></div><div className="field"><label>Subtitle (বাংলা)</label><input name="subtitleBn" maxLength={500} /></div>
                <div className="field"><label>Destination link</label><input name="link" defaultValue="/products" maxLength={500} /></div><div className="field"><label>Sort order</label><input name="order" type="number" defaultValue={0} /></div>
                <div className="field wide"><label>Banner image</label><input type="file" accept="image/*" onChange={(event) => uploadFile(event)} />{image && <><small className="subtle">Image uploaded</small><div className="product-image-previews"><div className="product-image-preview"><Image src={image} alt="Uploaded banner preview" width={448} height={176} unoptimized /><button type="button" onClick={() => setImage("")}>Remove image</button></div></div></>}</div>
                <label className="admin-check"><input type="checkbox" name="active" defaultChecked /> Active</label>
              </>}
              {(tab === "Products" || tab === "My products") && <>
                <div className="field"><label>Product name (English)</label><input name="titleEn" required maxLength={500} /></div><div className="field"><label>Product name (বাংলা)</label><input name="titleBn" maxLength={500} /></div>
                <div className="field wide"><label>Description (English)</label><textarea name="descriptionEn" required maxLength={5000} /></div><div className="field wide"><label>Description (বাংলা)</label><textarea name="descriptionBn" maxLength={5000} /></div>
                <div className="field"><label>Category</label><select name="category" required value={selectedProductCategory} onChange={(event) => selectProductCategory(event.target.value)}><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name.en}</option>)}</select><small className="subtle">Category suggestions fill in standard sizes or packs. Add a matching category in the Categories tab if it is not listed.</small></div>
                <div className="field"><label>{productVariants.length ? "Stock counted in" : "Selling unit"}</label><select name="unit" value={productUnit} disabled={productVariants.length > 0} onChange={(event) => setProductUnit(event.target.value as ProductUnit)}>{productUnits.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></div>
                {productVariants.length === 0 ? <>
                  <div className="wide unit-options-toggle"><span>Need sizes or pack options? Add size / volume options with separate prices and stock.</span><button type="button" className="button-secondary" onClick={() => setProductVariants([{ label: "", price: "", stock: "" }])}>Add size / volume options</button></div>
                  <div className="field"><label>Regular price per {unitLabel(productUnit)} (৳)</label><input name="price" type="number" min="0" step="0.01" required /></div><div className="field"><label>Sale price per {unitLabel(productUnit)} (৳, optional)</label><input name="discountPrice" type="number" min="0" step="0.01" /></div>
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
              <button className="button-primary wide" disabled={busy}>{busy ? "Saving…" : tab === "Admin users" ? "Create sub-admin" : `Add ${tab === "My products" ? "product" : tab.slice(0, -1)}`}</button>
            </form>}
            <div className="data-table-wrap"><DataTable tab={tab} items={items} update={update} can={can} categories={categories} vendors={vendors} userRole={user?.role ?? ""} /></div>
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
      const result = await response.json() as { profile?: typeof profile; error?: string };
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
      const result = await response.json() as { profile?: typeof profile; error?: string };
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

function DataTable({ tab, items, update, can, categories, vendors, userRole }: { tab: string; items: Item[]; update: (url: string, method: "PATCH" | "DELETE", body?: unknown) => Promise<string | null>; can: (permission: string) => boolean; categories: Category[]; vendors: VendorOption[]; userRole: string }) {
  const [editingProduct, setEditingProduct] = useState<Item | null>(null);
  if (["Categories", "Banners", "Products", "My products", "Featured products"].includes(tab)) {
    const endpoint = tab === "Categories" ? "/api/categories" : tab === "Banners" ? "/api/banners" : "/api/products";
    return <>
    {editingProduct && <ProductEditor
      product={editingProduct}
      categories={categories}
      vendors={vendors}
      userRole={userRole}
      onClose={() => setEditingProduct(null)}
      onSave={(body) => update(`/api/products/${editingProduct._id}`, "PATCH", body)}
    />}
    <table className="data-table"><thead><tr><th>Name</th>{(tab === "Products" || tab === "My products" || tab === "Featured products") && <><th>Category / options</th><th>Price</th><th>Featured</th></>}<th>Status</th>{tab === "Products" && <th>Approval</th>}<th>Actions</th></tr></thead><tbody>{items.map((item) => {
      const variants = item.variants ?? [];
      const effectivePrice = item.discountPrice ?? item.price;
      const categoryName = typeof item.category === "object" && item.category !== null ? item.category.name?.en : "";
      return <tr key={item._id}>
        <td>{localizedName(item)}</td>
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
        const image = window.prompt("Cloudinary image URL (leave blank to remove)", item.image ?? "");
        if (image !== null) void update(`${endpoint}/${item._id}`, "PATCH", { name: { en, bn }, image: image.trim() });
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
        const link = window.prompt("Destination link (relative path or HTTPS URL)", item.link ?? "/");
        if (link === null) return;
        const order = window.prompt("Sort order", String(item.order ?? 0));
        if (order === null) return;
        const image = window.prompt("Cloudinary image URL", String(item.image ?? ""));
        if (image !== null) void update(`${endpoint}/${item._id}`, "PATCH", { title: { en, bn }, subtitle: { en: subtitleEn, bn: subtitleBn }, link, order: Number(order), ...(image.trim() ? { image: image.trim() } : {}) });
      } else {
        setEditingProduct(item);
      }
    }}>{tab === "Categories" || tab === "Banners" ? "Edit" : "Edit product"}</button>}{tab !== "Featured products" && tab !== "My products" && <button className="inline-button" onClick={() => void update(`${endpoint}/${item._id}`, "PATCH", { active: item.active === false })}>{item.active === false ? "Activate" : "Deactivate"}</button>}{tab !== "Featured products" && <button className="inline-button" onClick={() => { if (window.confirm("Delete this item?")) void update(`${endpoint}/${item._id}`, "DELETE"); }}>Delete</button>}</td></tr>;
    })}</tbody></table></>;
  }
  if (["Bookings", "My bookings"].includes(tab)) return <table className="data-table"><thead><tr><th>Order</th><th>Customer / items</th><th>Total</th><th>Status</th><th>Update status</th></tr></thead><tbody>{items.map((item) => {
    const itemLines = item.items ?? [];
    const possible = statuses.filter((next) => {
      const eligible = itemLines.filter((line) => canMove(line.status, next));
      return tab === "My bookings" ? eligible.length > 0 : itemLines.length > 0 && eligible.length === itemLines.length;
    });
    const canManage = tab === "My bookings" || can("manage_bookings");
    const customer = item.customerInfo;
    return <tr key={item._id}><td>#{item._id.slice(-8).toUpperCase()}</td><td>{customer && <><strong>{customer.name}</strong><br />{customer.phone}<br />{customer.address}<br /></>}{itemLines.map((line) => `${line.title}${line.variantLabel ? ` (${line.variantLabel})` : ""} × ${line.quantity} ${unitLabel(line.unit)} · ৳${Number(line.unitPrice ?? 0).toLocaleString("en-BD")} each (${line.status})`).join(", ")}</td><td>৳{Number(item.total ?? 0).toLocaleString("en-BD")}</td><td><span className="status-pill">{item.status}</span></td><td>{canManage ? <select defaultValue="" aria-label="Update order status" onChange={(event) => { if (event.target.value) void update(`/api/orders/${item._id}`, "PATCH", { status: event.target.value }); }}><option value="">Choose status</option>{possible.map((status) => <option key={status} value={status}>{status}</option>)}</select> : <span className="subtle">View only</span>}</td></tr>;
  })}</tbody></table>;
  if (tab === "Vendor applications") return <table className="data-table"><thead><tr><th>Shop / contact</th><th>Details / documents</th><th>Status</th><th>Decision</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td>{String(item.shopName)}<br />{String(item.email)}</td><td>{String(item.name)} · {String(item.phone)}<br />{String(item.address)}<br />{Array.isArray(item.documents) && item.documents.map((document, index) => <a className="inline-button" key={String(document)} href={String(document)} target="_blank" rel="noreferrer">Document {index + 1}</a>)}</td><td>{String(item.status)}</td><td>{item.status === "pending" && <><button className="inline-button" onClick={() => void update(`/api/vendor-applications/${item._id}`, "PATCH", { status: "approved" })}>Approve</button><button className="inline-button" onClick={() => void update(`/api/vendor-applications/${item._id}`, "PATCH", { status: "rejected" })}>Reject</button></>}</td></tr>)}</tbody></table>;
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
  return current === next || transitions[current]?.includes(next);
}
