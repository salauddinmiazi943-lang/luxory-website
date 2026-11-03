"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductView } from "@/components/product-card";
import { isValidQuantity, quantityStep, unitLabel } from "@/lib/product-units";

type Detail = ProductView & {
  description?: { en: string; bn?: string };
  category?: { name?: { en: string; bn?: string } };
  stock?: number;
  unit?: string;
  variants?: { _id?: string; label: string; price: number; stock: number }[];
};

export function ProductDetail({ slug }: { slug: string }) {
  const { locale, addToCart, t } = useStore();
  const [product, setProduct] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetch(`/api/products/${encodeURIComponent(slug)}`).then(async (response) => {
      const result = await response.json() as { item?: Detail; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Product not found");
      setProduct(result.item);
      setSelectedVariantId(result.item.variants?.[0]?._id ?? "");
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load product"));
  }, [slug]);

  if (error) return <div className="page-shell"><p>{error}</p><Link className="button-primary" href="/products">Back to products</Link></div>;
  if (!product) return <div className="page-shell">Loading product…</div>;

  const id = product._id ?? product.slug;
  const name = product.title[locale] || product.title.en;
  const description = product.description?.[locale] || product.description?.en || "";
  const image = product.images?.[0];
  const unit = product.unit ?? "piece";
  const step = quantityStep(unit);
  const hasVariants = Boolean(product.variants?.length);
  const hasDiscount = product.discountPrice != null;
  const selectedVariant = product.variants?.find((variant) => variant._id === selectedVariantId);
  const price = selectedVariant?.price ?? (hasVariants ? Math.min(...product.variants!.map((variant) => variant.price)) : product.discountPrice ?? product.price);
  const stock = selectedVariant?.stock ?? (hasVariants ? 0 : product.stock ?? 0);

  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">Home</Link>　/　<Link href="/products">Products</Link>　/　{name}</div>
    <div className="product-detail">
      <div className="detail-art">{image?.startsWith("https://res.cloudinary.com/") ? <Image src={image} alt={name} width={600} height={600} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 5 }} /> : "◉"}</div>
      <div className="detail-copy">
        <p className="eyebrow">{product.category?.name?.[locale] || "Store product"}</p>
        <h1>{name}</h1>
        <div className="detail-price">{hasVariants ? "From " : ""}৳{price.toLocaleString("en-BD")} <span>/ {hasVariants ? selectedVariant?.label ?? "option" : unitLabel(unit, locale)}</span>{!hasVariants && hasDiscount && <del style={{ color: "#a4aaae", fontSize: 15, marginLeft: 12 }}>৳{product.price.toLocaleString("en-BD")}</del>}</div>
        <p>{description}</p>
        {hasVariants && <div className="field product-option-field"><label htmlFor="product-option">Size / option</label><select id="product-option" value={selectedVariantId} onChange={(event) => { setSelectedVariantId(event.target.value); setQuantity(1); }}><option value="" disabled>Select an option</option>{product.variants!.map((variant) => <option key={variant._id} value={variant._id} disabled={variant.stock <= 0}>{variant.label} — ৳{variant.price.toLocaleString("en-BD")} · {variant.stock > 0 ? `${variant.stock} in stock` : "out of stock"}</option>)}</select></div>}
        <p>{stock === 0 ? t("outOfStock") : `${stock} ${unitLabel(unit, locale)} ${t("inStock")}`}</p>
        {stock > 0 && <div className="field product-quantity-field"><label htmlFor="product-quantity">Quantity ({unitLabel(unit, locale)})</label><input id="product-quantity" type="number" min={step} max={stock} step={step} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></div>}
        <button className="button-primary" disabled={stock === 0 || !isValidQuantity(unit, quantity) || quantity > stock} onClick={() => addToCart({ id, slug: product.slug, name, image: image ?? "", price, quantity, unit, ...(selectedVariant?._id ? { variantId: selectedVariant._id, variantLabel: selectedVariant.label } : {}) })}><ShoppingBag size={16} /> {t("addToCart")}</button>
        <p className="subtle">{t("secureCheckout")}</p>
      </div>
    </div>
  </div>;
}
