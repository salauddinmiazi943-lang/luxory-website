"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { useStore, type WishlistItem } from "@/components/store-context";
import { formatBdt, resolveProductPricing } from "@/lib/pricing";

export type ProductView = {
  _id?: string; id?: string; slug: string; title: { en: string; bn?: string }; name?: string;
  price: number; discountPrice?: number; originalPrice?: number; images?: string[]; stock?: number; unit?: string;
  category?: { _id?: string; slug?: string; name?: { en?: string; bn?: string } };
  variants?: {
    _id?: string; label: string; colorHex?: string; price: number; originalPrice?: number; stock: number;
    sku?: string; availability?: string; images?: string[]; attributeValues?: Record<string, string | number | boolean | string[]>;
  }[];
  rating?: number; reviewCount?: number;
};

const icons = ["◉", "◌", "⌚", "◈", "◉", "✦"];
export function ProductCard({ product, index = 0 }: { product: ProductView; index?: number }) {
  const { locale, t, toggleWishlist, isWishlisted } = useStore();
  const id = product._id ?? product.id ?? product.slug;
  const title = product.title ? product.title[locale] || product.title.en : product.name ?? "Product";
  const images = useMemo(
    () => (product.images ?? []).filter((url) => url.startsWith("https://res.cloudinary.com/")),
    [product.images],
  );
  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setImageIndex((current) => (current + 1) % images.length);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [images.length]);
  useEffect(() => {
    if (images.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const preload = new window.Image();
    preload.src = images[(imageIndex + 1) % images.length];
  }, [imageIndex, images]);
  const image = images[imageIndex] ?? images[0];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const [selectedVariantId, setSelectedVariantId] = useState(() => variants.find((v) => v.stock > 0)?._id ?? "");
  const pricing = resolveProductPricing(product, selectedVariantId);
  const stock = pricing.stock;
  const wishlisted = isWishlisted(id);
  const wishlistItem: WishlistItem = { ...product, title: product.title ?? { en: title } };
  const href = product._id ? `/products/${product.slug || id}` : "/products";

  return <motion.article
    className="product-card"
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(index % 4, 3) * 0.04 }}
  >
    <Link href={href} className={`product-image product-tone-${index % 6}`} aria-label={title}>
      {images.length > 1 && image ? <div className="product-image-stage" aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.div
            key={image}
            className="product-image-slide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
          >
            <Image src={image} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
          </motion.div>
        </AnimatePresence>
      </div> : image ? <Image src={image} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" /> : <span className="product-placeholder">{icons[index % icons.length]}</span>}
      {pricing.discountPercent > 0 ? <span className="sale-tag">{pricing.discountPercent}% OFF</span> : null}
      {stock <= 0 ? <span className="sale-tag" style={{ left: "auto", right: 10, background: "#6b6b6b", color: "#FFFFFF" }}>Out of stock</span> : null}
    </Link>
    <div className="product-meta"><span className="product-category">{product.category?.name?.[locale] || product.category?.name?.en || t("shop")}</span><div className="product-card-actions"><button type="button" className={`product-card-wishlist${wishlisted ? " is-active" : ""}`} aria-label={`${wishlisted ? "Remove from" : "Add to"} wishlist: ${title}`} aria-pressed={wishlisted} onClick={() => toggleWishlist(wishlistItem)}><Heart size={16} fill={wishlisted ? "currentColor" : "none"} /></button></div></div>
    <Link href={href} className="product-title">{title}</Link>
    {typeof product.rating === "number" && product.rating > 0 ? <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>★ {product.rating.toFixed(1)}{product.reviewCount ? ` (${product.reviewCount})` : ""}</div> : null}
    <div className="price-row" style={{ flexWrap: "wrap" }}>
      <strong>{pricing.hasVariants && !pricing.selected ? "From " : ""}{formatBdt(pricing.current)}</strong>
      {pricing.discountPercent > 0 && <del>{formatBdt(pricing.original)}</del>}
    </div>
    {variants.length > 0 ? <div className="product-card-variants" aria-label={t("productOption")}>
      {variants.map((variant) => <button type="button" key={variant._id ?? variant.label} className={`product-card-variant${selectedVariantId === variant._id ? " selected" : ""}`} aria-pressed={selectedVariantId === variant._id} disabled={variant.stock <= 0} onClick={() => setSelectedVariantId(variant._id ?? "")}>{variant.colorHex && <span className="colour-swatch" aria-hidden="true" style={{ background: variant.colorHex }} />}{variant.label}</button>)}
    </div> : null}
    <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>{stock > 0 ? "In stock" : t("outOfStock")}</div>
  </motion.article>;
}
