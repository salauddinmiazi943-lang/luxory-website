"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Heart } from "lucide-react";
import { useStore, type WishlistItem } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";
import { formatBdt, resolveProductPricing } from "@/lib/pricing";

export type ProductView = {
  _id?: string; id?: string; slug: string; title: { en: string; bn?: string }; name?: string;
  price: number; discountPrice?: number; originalPrice?: number; images?: string[]; stock?: number; unit?: string;
  category?: { _id?: string; slug?: string; name?: { en?: string; bn?: string } };
  variants?: { _id?: string; label: string; price: number; originalPrice?: number; stock: number }[];
  rating?: number; reviewCount?: number;
};

const icons = ["◉", "◌", "⌚", "◈", "◉", "✦"];
export function ProductCard({ product, index = 0 }: { product: ProductView; index?: number }) {
  const { locale, t, toggleWishlist, isWishlisted } = useStore();
  const id = product._id ?? product.id ?? product.slug;
  const title = product.title ? product.title[locale] || product.title.en : product.name ?? "Product";
  const image = product.images?.[0];
  const validImage = Boolean(image?.startsWith("https://res.cloudinary.com/"));
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const [selectedVariantId, setSelectedVariantId] = useState(() => variants.find((v) => v.stock > 0)?._id ?? "");
  const pricing = resolveProductPricing(product, selectedVariantId);
  const stock = pricing.stock;
  const wishlisted = isWishlisted(id);
  const wishlistItem: WishlistItem = { ...product, title: product.title ?? { en: title } };
  const href = product._id ? `/products/${product.slug || id}` : "/products";

  return <article className="product-card">
    <Link href={href} className={`product-image product-tone-${index % 6}`}>
      {validImage ? <Image src={image!} alt={title} width={600} height={600} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" style={{ width: "100%", height: "auto", objectFit: "contain" }} /> : <span className="product-placeholder">{icons[index % icons.length]}</span>}
      {pricing.discountPercent > 0 ? <span className="sale-tag">{pricing.discountPercent}% OFF</span> : null}
      {stock <= 0 ? <span className="sale-tag" style={{ left: "auto", right: 10, background: "#6b6b6b", color: "#FFFFFF" }}>Out of stock</span> : null}
    </Link>
    <div className="product-meta"><span className="product-category">{product.category?.name?.[locale] || product.category?.name?.en || t("shop")}</span><div className="product-card-actions"><button type="button" className={`product-card-wishlist${wishlisted ? " is-active" : ""}`} aria-label={`${wishlisted ? "Remove from" : "Add to"} wishlist: ${title}`} aria-pressed={wishlisted} onClick={() => toggleWishlist(wishlistItem)}><Heart size={16} fill={wishlisted ? "currentColor" : "none"} /></button></div></div>
    <Link href={href} className="product-title">{title}</Link>
    {typeof product.rating === "number" && product.rating > 0 ? <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>★ {product.rating.toFixed(1)}{product.reviewCount ? ` (${product.reviewCount})` : ""}</div> : null}
    <div className="price-row" style={{ flexWrap: "wrap" }}>
      <strong>{pricing.hasVariants && !pricing.selected ? "From " : ""}{formatBdt(pricing.current)}</strong>
      {pricing.discountPercent > 0 && <del>{formatBdt(pricing.original)}</del>}
      <span>/ {pricing.hasVariants ? (pricing.variantLabel || pricing.lowestLabel || t("productOption")) : unitLabel(product.unit, locale)}</span>
    </div>
    {variants.length > 0 ? <div className="product-card-variants" aria-label={t("productOption")}>
      {variants.map((variant) => <button type="button" key={variant._id ?? variant.label} className={`product-card-variant${selectedVariantId === variant._id ? " selected" : ""}`} aria-pressed={selectedVariantId === variant._id} disabled={variant.stock <= 0} onClick={() => setSelectedVariantId(variant._id ?? "")}>{variant.label}</button>)}
    </div> : null}
    <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>{stock > 0 ? "In stock" : t("outOfStock")}</div>
  </article>;
}
