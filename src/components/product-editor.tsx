"use client";

import { useState } from "react";
import { categoryProductPreset } from "@/lib/category-product-options";
import { productUnits, quantityStep, unitLabel, type ProductUnit } from "@/lib/product-units";

type ProductOption = { id?: string; label: string; price: string; stock: string };
type ProductForEdit = {
  _id: string;
  title?: { en?: string; bn?: string };
  description?: { en?: string; bn?: string };
  category?: string | { _id?: string };
  vendor?: string | { _id?: string };
  price?: number;
  discountPrice?: number;
  stock?: number;
  unit?: string;
  variants?: { _id?: string; label: string; price: number; stock: number }[];
  images?: string[];
  active?: boolean;
  featured?: boolean;
};
type CategoryOption = { _id: string; slug: string; name: { en: string; bn: string } };
type VendorOption = { id: string; name: string; email: string };

function referenceId(reference: string | { _id?: string } | undefined) {
  return typeof reference === "string" ? reference : reference?._id ?? "";
}

export function ProductEditor({
  product,
  categories,
  vendors,
  userRole,
  onClose,
  onSave,
}: {
  product: ProductForEdit;
  categories: CategoryOption[];
  vendors: VendorOption[];
  userRole: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [titleEn, setTitleEn] = useState(product.title?.en ?? "");
  const [titleBn, setTitleBn] = useState(product.title?.bn ?? "");
  const [descriptionEn, setDescriptionEn] = useState(product.description?.en ?? "");
  const [descriptionBn, setDescriptionBn] = useState(product.description?.bn ?? "");
  const [category, setCategory] = useState(referenceId(product.category));
  const [vendor, setVendor] = useState(referenceId(product.vendor));
  const [unit, setUnit] = useState<ProductUnit>(
    productUnits.includes(product.unit as ProductUnit) ? product.unit as ProductUnit : "piece",
  );
  const [price, setPrice] = useState(String(product.price ?? 0));
  const [discountPrice, setDiscountPrice] = useState(product.discountPrice == null ? "" : String(product.discountPrice));
  const [stock, setStock] = useState(String(product.stock ?? 0));
  const [variants, setVariants] = useState<ProductOption[]>(() => (product.variants ?? []).map((variant) => ({
    ...(variant._id ? { id: variant._id } : {}),
    label: variant.label,
    price: String(variant.price),
    stock: String(variant.stock),
  })));
  const [images, setImages] = useState((product.images ?? []).join("\n"));
  const [active, setActive] = useState(product.active !== false);
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeCategory(categoryId: string) {
    setCategory(categoryId);
    const preset = categoryProductPreset(categories.find((item) => item._id === categoryId));
    if (!preset) return;
    setUnit(preset.unit);
    setVariants((current) => preset.options.map((label) => {
      const previous = current.find((option) => option.label.trim().toLowerCase() === label.toLowerCase());
      return previous
        ? { ...previous, label }
        : { label, price: "", stock: "" };
    }));
    setDiscountPrice("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const body: Record<string, unknown> = {
      title: { en: titleEn.trim(), bn: titleBn.trim() },
      description: { en: descriptionEn.trim(), bn: descriptionBn.trim() },
      category,
      unit,
      images: images.split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean),
      active,
      featured,
    };

    if (variants.length) {
      body.variants = variants.map((variant) => ({
        ...(variant.id ? { id: variant.id } : {}),
        label: variant.label.trim(),
        price: Number(variant.price),
        stock: Number(variant.stock),
      }));
      body.discountPrice = null;
    } else {
      body.price = Number(price);
      body.discountPrice = discountPrice.trim() ? Number(discountPrice) : null;
      body.stock = Number(stock);
    }

    if (userRole !== "vendor") body.vendor = vendor || null;

    try {
      const result = await onSave(body);
      if (result) setError(result);
      else onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update product");
    } finally {
      setBusy(false);
    }
  }

  return <div className="product-editor-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section className="product-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
      <header className="product-editor-header">
        <div><p className="eyebrow">PRODUCT MANAGEMENT</p><h2 id="product-editor-title">Edit product</h2></div>
        <button type="button" className="product-editor-close" aria-label="Close editor" disabled={busy} onClick={onClose}>×</button>
      </header>
      <form className="product-editor-form" onSubmit={submit}>
        {error && <p className="form-error wide">{error}</p>}
        <div className="field"><label htmlFor="edit-product-title-en">Product name (English)</label><input id="edit-product-title-en" value={titleEn} onChange={(event) => setTitleEn(event.target.value)} required maxLength={500} /></div>
        <div className="field"><label htmlFor="edit-product-title-bn">Product name (বাংলা)</label><input id="edit-product-title-bn" value={titleBn} onChange={(event) => setTitleBn(event.target.value)} maxLength={500} /></div>
        <div className="field wide"><label htmlFor="edit-product-description-en">Description (English)</label><textarea id="edit-product-description-en" value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} required maxLength={5000} /></div>
        <div className="field wide"><label htmlFor="edit-product-description-bn">Description (বাংলা)</label><textarea id="edit-product-description-bn" value={descriptionBn} onChange={(event) => setDescriptionBn(event.target.value)} maxLength={5000} /></div>
        <div className="field"><label htmlFor="edit-product-category">Category</label><select id="edit-product-category" value={category} required onChange={(event) => changeCategory(event.target.value)}><option value="" disabled>Select a category</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name.en}</option>)}</select></div>
        <div className="field"><label htmlFor="edit-product-unit">{variants.length ? "Stock counted in" : "Selling unit"}</label><select id="edit-product-unit" value={unit} disabled={variants.length > 0} onChange={(event) => setUnit(event.target.value as ProductUnit)}>{productUnits.map((item) => <option key={item} value={item}>{unitLabel(item)}</option>)}</select></div>

        {variants.length ? <div className="wide product-variants-field">
          <div className="product-variants-heading"><div><strong>Option prices and stock</strong><small>These prices are for each selected size or pack. Removing every option returns this product to one price per selling unit.</small></div><button type="button" className="button-secondary" disabled={variants.length >= 30} onClick={() => setVariants((current) => [...current, { label: "", price: "", stock: "" }])}>Add option</button></div>
          {variants.map((variant, index) => <div className="product-variant-row" key={variant.id ?? `new-${index}`}>
            <div className="field"><label htmlFor={`edit-option-label-${index}`}>Size / option</label><input id={`edit-option-label-${index}`} value={variant.label} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} required maxLength={60} /></div>
            <div className="field"><label htmlFor={`edit-option-price-${index}`}>Price per option (৳)</label><input id={`edit-option-price-${index}`} type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} required /></div>
            <div className="field"><label htmlFor={`edit-option-stock-${index}`}>Stock ({unitLabel(unit)})</label><input id={`edit-option-stock-${index}`} type="number" min="0" step={quantityStep(unit)} value={variant.stock} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stock: event.target.value } : item))} required /></div>
            <button type="button" className="remove-variant-button" aria-label={`Remove ${variant.label || `option ${index + 1}`}`} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>)}
        </div> : <>
          <div className="wide unit-options-toggle"><span>This product has no saved size/volume options yet. Add options to set a separate price and stock for each size or pack.</span><div className="product-editor-option-actions">{categoryProductPreset(categories.find((item) => item._id === category)) && <button type="button" className="button-secondary" onClick={() => changeCategory(category)}>Use category suggestions</button>}<button type="button" className="button-secondary" onClick={() => setVariants([{ label: "", price: "", stock: "" }])}>Add custom option</button></div></div>
          <div className="field"><label htmlFor="edit-product-price">Regular price per {unitLabel(unit)} (৳)</label><input id="edit-product-price" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></div>
          <div className="field"><label htmlFor="edit-product-discount">Sale price per {unitLabel(unit)} (৳)</label><input id="edit-product-discount" type="number" min="0" step="0.01" value={discountPrice} onChange={(event) => setDiscountPrice(event.target.value)} /></div>
          <div className="field"><label htmlFor="edit-product-stock">Stock ({unitLabel(unit)})</label><input id="edit-product-stock" type="number" min="0" step={quantityStep(unit)} value={stock} onChange={(event) => setStock(event.target.value)} required /></div>
        </>}

        {userRole !== "vendor" && <div className="field"><label htmlFor="edit-product-vendor">Vendor</label><select id="edit-product-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">Store product</option>{vendors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></div>}
        <div className="field wide"><label htmlFor="edit-product-images">Image URLs (one per line or comma-separated)</label><textarea id="edit-product-images" value={images} onChange={(event) => setImages(event.target.value)} /></div>
        {userRole !== "vendor" && <div className="wide product-editor-checks"><label className="admin-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><label className="admin-check"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Featured</label></div>}
        <footer className="product-editor-actions wide"><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button></footer>
      </form>
    </section>
  </div>;
}
