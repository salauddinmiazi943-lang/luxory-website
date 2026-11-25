"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useStore } from "@/components/store-context";

export function WishlistPage() {
  const { t, wishlist } = useStore();

  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("wishlist")}</div>
    <div className="section-heading"><div><p className="eyebrow">{t("wishlist")}</p><h1 className="page-title">{t("wishlist")}</h1></div><span className="subtle">{wishlist.length} {t("items")}</span></div>
    {wishlist.length ? <div className="product-grid">{wishlist.map((product, index) => <ProductCard key={product._id ?? product.id ?? product.slug} product={product} index={index} />)}</div>
      : <div className="form-card wishlist-empty"><Heart size={30} strokeWidth={1.5} /><p>{t("emptyWishlist")}</p><Link className="button-primary" href="/products">{t("continueShopping")}</Link></div>}
  </div>;
}
