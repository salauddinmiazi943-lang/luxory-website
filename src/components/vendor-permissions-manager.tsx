"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PermissionSet = {
  productAddEnabled: boolean;
  allowedCategoryIds: string[];
  deniedCategoryIds: string[];
  maxProducts: number;
  requireApproval: boolean;
};
type Vendor = {
  id: string;
  name: string;
  shopName: string;
  email: string;
  status: string;
  productCount: number;
  permissions: PermissionSet;
};
type Category = {
  id: string;
  name: { en?: string; bn?: string };
  parentCategory: string | null;
  active: boolean;
};

async function responseData(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error("Server returned an invalid response.");
  }
}

export function VendorPermissionsManager() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const [draft, setDraft] = useState<PermissionSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vendor-permissions");
      const data = await responseData(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load vendor permissions");
      if (!Array.isArray(data.vendors) || !Array.isArray(data.categories)) throw new Error("Vendor permissions response is invalid");
      const nextVendors = data.vendors as Vendor[];
      setVendors(nextVendors);
      setCategories(data.categories as Category[]);
      const selected = nextVendors.find((vendor) => vendor.id === selectedIdRef.current) ?? nextVendors[0];
      selectedIdRef.current = selected?.id ?? "";
      setSelectedId(selected?.id ?? "");
      setDraft(selected ? { ...selected.permissions } : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load vendor permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedVendor = vendors.find((vendor) => vendor.id === selectedId);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const orderedCategories = useMemo(() => [...categories].sort((a, b) => {
    const aParent = a.parentCategory ? categoryById.get(a.parentCategory)?.name.en ?? "" : "";
    const bParent = b.parentCategory ? categoryById.get(b.parentCategory)?.name.en ?? "" : "";
    return aParent.localeCompare(bParent) || a.name.en?.localeCompare(b.name.en ?? "") || 0;
  }), [categories, categoryById]);

  function chooseVendor(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    const vendor = vendors.find((item) => item.id === id);
    setDraft(vendor ? { ...vendor.permissions } : null);
    setError("");
    setNotice("");
  }

  function setCategoryPermission(categoryId: string, value: "allowed" | "denied" | "none") {
    setDraft((current) => {
      if (!current) return current;
      const allowedCategoryIds = current.allowedCategoryIds.filter((id) => id !== categoryId);
      const deniedCategoryIds = current.deniedCategoryIds.filter((id) => id !== categoryId);
      if (value === "allowed") allowedCategoryIds.push(categoryId);
      if (value === "denied") deniedCategoryIds.push(categoryId);
      return { ...current, allowedCategoryIds, deniedCategoryIds };
    });
  }

  async function save() {
    if (!selectedVendor || !draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/vendor-permissions/${selectedVendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await responseData(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save vendor permissions");
      setNotice("Vendor permissions saved.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save vendor permissions");
    } finally {
      setSaving(false);
    }
  }

  if (loading && vendors.length === 0) return <p className="subtle">Loading approved vendors…</p>;
  if (!vendors.length) return <div>{error && <p className="form-error" role="alert">{error}</p>}<p className="subtle">{error ? "Could not load approved vendors." : "There are no approved vendors to manage."}</p>{error && <button className="button-secondary" type="button" onClick={() => void load()}>Try again</button>}</div>;

  return <div className="admin-form">
    {error && <p className="form-error wide" role="alert">{error}</p>}
    {notice && <p className="form-success wide" role="status">{notice}</p>}
    <div className="field wide">
      <label htmlFor="vendor-permissions-vendor">Approved vendor</label>
      <select id="vendor-permissions-vendor" value={selectedId} onChange={(event) => chooseVendor(event.target.value)}>
        {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.shopName || vendor.name} — {vendor.email}</option>)}
      </select>
    </div>
    {selectedVendor && draft && <>
      <h3 className="wide">Manage Permissions</h3>
      <p className="wide subtle">
        {selectedVendor.productCount} existing product(s), including items in Recently Deleted. New vendors default to no product-add access until configured.
      </p>
      <label className="admin-check wide">
        <input type="checkbox" checked={draft.productAddEnabled} onChange={(event) => setDraft({ ...draft, productAddEnabled: event.target.checked })} />
        Allow this vendor to add products
      </label>
      <div className="field">
        <label htmlFor="vendor-product-limit">Maximum products</label>
        <input id="vendor-product-limit" type="number" min={0} max={100000} step={1} value={draft.maxProducts} onChange={(event) => setDraft({ ...draft, maxProducts: Number(event.target.value) })} />
      </div>
      <label className="admin-check">
        <input type="checkbox" checked={draft.requireApproval} onChange={(event) => setDraft({ ...draft, requireApproval: event.target.checked })} />
        Require admin approval for vendor products
      </label>
      <div className="wide">
        <h3>Category permissions</h3>
        <p className="subtle">Tick the categories this vendor may add products to. Unchecked categories have no access; denied categories always take precedence.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Type</th><th>Allow product addition</th></tr></thead>
            <tbody>{orderedCategories.map((category) => {
              const parent = category.parentCategory ? categoryById.get(category.parentCategory) : undefined;
              const allowed = draft.allowedCategoryIds.includes(category.id) && !draft.deniedCategoryIds.includes(category.id);
              return <tr key={category.id}>
                <td>{category.parentCategory ? `↳ ${category.name.en || category.name.bn || category.id}` : category.name.en || category.name.bn || category.id}</td>
                <td>{category.parentCategory ? `Subcategory${parent ? ` of ${parent.name.en || parent.name.bn || ""}` : ""}` : "Main category"}{!category.active && " · Inactive"}</td>
                <td><label className="permission-option"><input
                  type="checkbox"
                  aria-label={`Allow ${category.name.en || category.name.bn || "category"}`}
                  checked={allowed}
                  onChange={(event) => setCategoryPermission(category.id, event.currentTarget.checked ? "allowed" : "none")}
                />Allow</label></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
      {draft.productAddEnabled && (!draft.allowedCategoryIds.length || draft.maxProducts < 1) && <p className="form-error wide">To enable adding products, allow at least one category and set a product limit above zero.</p>}
      <div className="wide"><button className="button-primary" type="button" disabled={saving || loading || (draft.productAddEnabled && (!draft.allowedCategoryIds.length || draft.maxProducts < 1))} onClick={() => void save()}>{saving ? "Saving…" : "Save permissions"}</button></div>
    </>}
  </div>;
}
