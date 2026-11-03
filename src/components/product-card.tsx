"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { useStore } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";

export type ProductView = {
  _id?: string; id?: string; slug: string; title: { en: string; bn?: string }; name?: string;
  price: number; discountPrice?: number; images?: string[]; stock?: number; unit?: string;
  category?: { name?: { en?: string; bn?: string } };
  variants?: { _id?: string; label: string; price: number; stock: number }[];
};

const icons = ["◉", "◌", "⌚", "◈", "◉", "✦"];
export function ProductCard({ product, index = 0 }: { product: ProductView; index?: number }) {
  const { locale, t, addToCart } = useStore();
  const id = product._id ?? product.id ?? product.slug;
  const title = product.title ? product.title[locale] || product.title.en : product.name ?? "Product";
  const image = product.images?.[0];
  const validImage = Boolean(image?.startsWith("https://res.cloudinary.com/"));
  const hasVariants = Boolean(product.variants?.length);
  const hasDiscount = product.discountPrice != null;
  const price = hasVariants ? Math.min(...product.variants!.map((variant) => variant.price)) : product.discountPrice ?? product.price;
  return <article className="product-card">
    <Link href={product._id ? `/products/${product.slug || id}` : "/products"} className={`product-image product-tone-${index % 6}`}>
      {validImage ? <Image src={image!} alt={title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" /> : <span className="product-placeholder">{icons[index % icons.length]}</span>}
      {hasDiscount ? <span className="sale-tag">SALE</span> : null}
    </Link>
    <div className="product-meta"><span className="product-category">{product.category?.name?.[locale] || t("shop")}</span>{hasVariants ? <Link className="product-card-action" aria-label={`Choose a size or option: ${title}`} href={`/products/${product.slug || id}`}><ShoppingBag size={17} /></Link> : <button aria-label={`${t("addToCart")}: ${title}`} disabled={!product._id} onClick={() => addToCart({ id, slug: product.slug || id, name: title, image: image ?? "", price, unit: product.unit ?? "piece" })}><ShoppingBag size={17} /></button>}</div>
    <Link href={product._id ? `/products/${product.slug || id}` : "/products"} className="product-title">{title}</Link>
    <div className="price-row"><strong>{hasVariants ? "From " : ""}৳{price.toLocaleString("en-BD")}</strong>{hasVariants ? <span>{product.variants!.length} options</span> : <><span>/ {unitLabel(product.unit)}</span>{hasDiscount && <del>৳{product.price.toLocaleString("en-BD")}</del>}</>}</div>
  </article>;
}
