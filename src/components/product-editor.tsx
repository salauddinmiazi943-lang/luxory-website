"use client";

import { useState } from "react";
import Image from "next/image";
import { categoryProductPreset } from "@/lib/category-product-options";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { productUnits, quantityStep, unitLabel, type ProductUnit } from "@/lib/product-units";

type ProductOption = { id?: string; label: string; colorHex?: string; price: string; stock: string; sku?: string; availability?: "in_stock" | "out_of_stock" | "preorder"; images?: string[]; attributeValues?: Record<string, string | number | boolean | string[]> };
type ProductForEdit = {
  _id: string;
  title?: { en?: string; bn?: string };
  description?: { en?: string; bn?: string };
  productDetails?: string;
  category?: string | { _id?: string };
  vendor?: string | { _id?: string };
  price?: number;
  discountPrice?: number;
  stock?: number;
  unit?: string;
  variants?: { _id?: string; label: string; colorHex?: string; price: number; stock: number; sku?: string; availability?: "in_stock" | "out_of_stock" | "preorder"; images?: string[]; attributeValues?: Record<string, string | number | boolean | string[]> }[];
  images?: string[];
  attributeValues?: Record<string, string | number | boolean | string[]>;
  active?: boolean;
  featured?: boolean;
};
type CategoryAttributeDefinition = {
  key: string;
  name: { en: string; bn?: string };
  type: "text" | "number" | "select" | "multiselect" | "boolean" | "colour";
  options?: { value: string; name: { en: string; bn?: string }; hex?: string }[];
  required?: boolean;
  displayOrder?: number;
  active?: boolean;
};
type CategoryOption = { _id: string; slug: string; name: { en: string; bn: string }; attributeDefinitions?: CategoryAttributeDefinition[] };
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
  const [productDetails, setProductDetails] = useState(product.productDetails ?? "");
  const [category, setCategory] = useState(referenceId(product.category));
  const [attributeValues, setAttributeValues] = useState<Record<string, string | number | boolean | string[]>>(product.attributeValues ?? {});
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
    colorHex: variant.colorHex,
    price: String(variant.price),
    stock: String(variant.stock),
    sku: variant.sku,
    availability: variant.availability,
    images: variant.images ?? [],
    attributeValues: variant.attributeValues ?? {},
  })));
  const [images, setImages] = useState(product.images ?? []);
  const [active, setActive] = useState(product.active !== false);
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function uploadImages(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (images.length + files.length > 12) {
      setError(`You can use up to 12 images. ${images.length} already added.`);
      input.value = "";
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Each image must be smaller than 10 MB.");
      input.value = "";
      return;
    }
    setBusy(true);
    setError("");
    try {
      const results = await Promise.allSettled(files.map((file) => uploadToCloudinary(file)));
      const urls = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setImages((current) => [...current, ...urls]);
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) setError(failure.reason instanceof Error ? failure.reason.message : "Some images could not be uploaded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image upload failed.");
    } finally {
      setBusy(false);
      input.value = "";
    }
  }

  function changeCategory(categoryId: string) {
    setCategory(categoryId);
    setAttributeValues({});
    const preset = categoryProductPreset(categories.find((item) => item._id === categoryId));
    if (!preset) return;
    const msg = `Apply category preset? Unit: ${unitLabel(preset.unit)}${preset.options.length ? `, suggested options: ${preset.options.join(", ")}` : ""}. You can still change the unit/options.`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setUnit(preset.unit);
    if (preset.options.length) {
      setVariants((current) => preset.options.map((label) => {
        const previous = current.find((option) => option.label.trim().toLowerCase() === label.toLowerCase());
        return previous ? { ...previous, label } : { label, price: "", stock: "" };
      }));
      setDiscountPrice("");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const body: Record<string, unknown> = {
      title: { en: titleEn.trim(), bn: titleBn.trim() },
      description: { en: descriptionEn.trim(), bn: descriptionBn.trim() },
      productDetails: productDetails.trim(),
      category,
      attributeValues,
      unit,
      images,
      active,
      featured,
    };

    if (variants.length) {
      body.variants = variants.map((variant) => ({
        ...(variant.id ? { id: variant.id } : {}),
        label: variant.label.trim(),
        ...(variant.colorHex ? { colorHex: variant.colorHex.toUpperCase() } : {}),
        price: Number(variant.price),
        stock: Number(variant.stock),
        sku: variant.sku?.trim() || undefined,
        availability: Number(variant.stock) > 0 ? variant.availability ?? "in_stock" : "out_of_stock",
        images: variant.images ?? [],
        attributeValues: variant.attributeValues ?? {},
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
        <div className="field wide"><label htmlFor="edit-product-details">Product details / specifications (optional)</label><textarea id="edit-product-details" value={productDetails} onChange={(event) => setProductDetails(event.target.value)} maxLength={3000} rows={5} placeholder={"Color: Black\nSize: 10 hands\nBrand: Example"} /><small className="subtle">Add color, size or measurements, brand, material, and other product facts. Use a new line for each detail.</small></div>
        <div className="field"><label htmlFor="edit-product-category">Category</label><select id="edit-product-category" value={category} required onChange={(event) => changeCategory(event.target.value)}><option value="" disabled>Select a category</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name.en}</option>)}</select></div>
        {(categories.find((item) => item._id === category)?.attributeDefinitions ?? []).filter((attribute) => attribute.active !== false).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((attribute) => <div className="field" key={attribute.key}>
          <label>{attribute.name.en}{attribute.name.bn ? ` / ${attribute.name.bn}` : ""}{attribute.required ? " *" : ""}</label>
          {attribute.type === "text" && <input value={String(attributeValues[attribute.key] ?? "")} required={attribute.required} maxLength={200} onChange={(event) => setAttributeValues((current) => ({ ...current, [attribute.key]: event.target.value }))} />}
          {attribute.type === "number" && <input type="number" step="0.01" value={typeof attributeValues[attribute.key] === "number" ? String(attributeValues[attribute.key]) : ""} required={attribute.required} onChange={(event) => setAttributeValues((current) => ({ ...current, [attribute.key]: event.target.value === "" ? "" : Number(event.target.value) }))} />}
          {attribute.type === "boolean" && <select value={typeof attributeValues[attribute.key] === "boolean" ? String(attributeValues[attribute.key]) : ""} required={attribute.required} onChange={(event) => setAttributeValues((current) => ({ ...current, [attribute.key]: event.target.value === "true" }))}><option value="" disabled>Select</option><option value="true">Yes</option><option value="false">No</option></select>}
          {(attribute.type === "select" || attribute.type === "colour") && <select value={typeof attributeValues[attribute.key] === "string" ? String(attributeValues[attribute.key]) : ""} required={attribute.required} onChange={(event) => setAttributeValues((current) => ({ ...current, [attribute.key]: event.target.value }))}><option value="" disabled>Select</option>{(attribute.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.name?.en || option.name?.bn || option.value}{option.hex ? ` · ${option.hex}` : ""}</option>)}</select>}
          {attribute.type === "multiselect" && <div>{(attribute.options ?? []).map((option) => {
            const selected = Array.isArray(attributeValues[attribute.key]) ? attributeValues[attribute.key] as string[] : [];
            return <label className="admin-check" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => setAttributeValues((current) => {
              const currentSelected = Array.isArray(current[attribute.key]) ? current[attribute.key] as string[] : [];
              return { ...current, [attribute.key]: event.target.checked ? [...currentSelected, option.value] : currentSelected.filter((value) => value !== option.value) };
            })} />{option.name?.en || option.name?.bn || option.value}</label>;
          })}</div>}
        </div>)}
        <div className="field"><label htmlFor="edit-product-unit">{variants.length ? "Stock counted in" : "Selling unit"}</label><select id="edit-product-unit" value={unit} disabled={variants.length > 0} onChange={(event) => setUnit(event.target.value as ProductUnit)}>{productUnits.map((item) => <option key={item} value={item}>{unitLabel(item)}</option>)}</select></div>

        {variants.length ? <div className="wide product-variants-field">
          <div className="product-variants-heading"><div><strong>Variants, prices and stock</strong><small>Add a color variant or a size/pack option. Each selected variant has its own price and stock.</small></div><div className="product-editor-option-actions"><button type="button" className="button-secondary" disabled={variants.length >= 30} onClick={() => setVariants((current) => [...current, { label: "", price: "", stock: "" }])}>Add option</button><button type="button" className="button-secondary" disabled={variants.length >= 30} onClick={() => setVariants((current) => [...current, { label: "", colorHex: "#000000", price: "", stock: "" }])}>Add color variant</button></div></div>
          {variants.map((variant, index) => <div className="product-variant-row" key={variant.id ?? `new-${index}`}>
            <div className="field"><label htmlFor={`edit-option-label-${index}`}>{variant.colorHex ? "Color name" : "Size / option"}</label><input id={`edit-option-label-${index}`} value={variant.label} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} required maxLength={60} /></div>
            {variant.colorHex && <div className="field"><label htmlFor={`edit-option-color-${index}`}>Color</label><input id={`edit-option-color-${index}`} type="color" value={variant.colorHex} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, colorHex: event.target.value.toUpperCase() } : item))} /></div>}
            <div className="field"><label htmlFor={`edit-option-price-${index}`}>Price per option (৳)</label><input id={`edit-option-price-${index}`} type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} required /></div>
            <div className="field"><label htmlFor={`edit-option-stock-${index}`}>Stock ({unitLabel(unit)})</label><input id={`edit-option-stock-${index}`} type="number" min="0" step={quantityStep(unit)} value={variant.stock} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stock: event.target.value } : item))} required /></div>
            <div className="field"><label htmlFor={`edit-option-sku-${index}`}>SKU (optional)</label><input id={`edit-option-sku-${index}`} value={variant.sku ?? ""} maxLength={80} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item))} /></div>
            <div className="field"><label htmlFor={`edit-option-availability-${index}`}>Availability</label><select id={`edit-option-availability-${index}`} value={variant.availability ?? "in_stock"} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, availability: event.target.value as "in_stock" | "out_of_stock" | "preorder" } : item))}><option value="in_stock">In stock</option><option value="preorder">Preorder</option><option value="out_of_stock">Out of stock</option></select></div>
            <button type="button" className="remove-variant-button" aria-label={`Remove ${variant.label || `option ${index + 1}`}`} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>)}
        </div> : <>
          <div className="wide unit-options-toggle"><span>This product has no saved variants yet. Add color variants or size/pack options with separate prices and stock.</span><div className="product-editor-option-actions">{categoryProductPreset(categories.find((item) => item._id === category)) && <button type="button" className="button-secondary" onClick={() => changeCategory(category)}>Use category suggestions</button>}<button type="button" className="button-secondary" onClick={() => setVariants([{ label: "", price: "", stock: "" }])}>Add size / pack option</button><button type="button" className="button-secondary" onClick={() => setVariants([{ label: "", colorHex: "#000000", price: "", stock: "" }])}>Add color variant</button></div></div>
          <div className="field"><label htmlFor="edit-product-price">Regular price per {unitLabel(unit)} (৳)</label><input id="edit-product-price" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></div>
          <div className="field"><label htmlFor="edit-product-discount">Sale price per {unitLabel(unit)} (৳, optional)</label><input id="edit-product-discount" type="number" min="0" step="0.01" value={discountPrice} onChange={(event) => setDiscountPrice(event.target.value)} /></div>
          <div className="field"><label htmlFor="edit-product-stock">Stock ({unitLabel(unit)})</label><input id="edit-product-stock" type="number" min="0" step={quantityStep(unit)} value={stock} onChange={(event) => setStock(event.target.value)} required /></div>
        </>}

        {userRole !== "vendor" && <div className="field"><label htmlFor="edit-product-vendor">Vendor</label><select id="edit-product-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">Store product</option>{vendors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></div>}
        <div className="field wide"><label htmlFor="edit-product-images">Product images (up to 12)</label><input id="edit-product-images" type="file" accept="image/*" multiple disabled={busy || images.length >= 12} onChange={uploadImages} />{images.length > 0 && <><small className="subtle">{images.length} image(s)</small><div className="product-image-previews">{images.map((url, index) => <div className="product-image-preview" key={`${url}-${index}`}><Image src={url} alt={`Product image ${index + 1}`} width={224} height={176} unoptimized /><button type="button" disabled={busy} aria-label={`Remove product image ${index + 1}`} onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>Remove</button></div>)}</div></>}</div>
        {userRole !== "vendor" && <div className="wide product-editor-checks"><label className="admin-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><label className="admin-check"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Featured</label></div>}
        <footer className="product-editor-actions wide"><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button></footer>
      </form>
    </section>
  </div>;
}
