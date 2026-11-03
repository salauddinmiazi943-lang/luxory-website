"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ProductCard, ProductView } from "@/components/product-card";
import { useStore } from "@/components/store-context";

const fallbackProducts: ProductView[] = [
  { slug: "orbit-headphones", title: { en: "Orbit wireless headphones", bn: "অরবিট ওয়্যারলেস হেডফোন" }, price: 7990, discountPrice: 6490 },
  { slug: "nova-smartwatch", title: { en: "Nova smart watch", bn: "নোভা স্মার্ট ঘড়ি" }, price: 5990 },
  { slug: "studio-speaker", title: { en: "Studio mini speaker", bn: "স্টুডিও মিনি স্পিকার" }, price: 4290 },
  { slug: "pulse-earbuds", title: { en: "Pulse wireless earbuds", bn: "পালস ওয়্যারলেস ইয়ারবাড" }, price: 3590, discountPrice: 2990 },
];

export function ProductSection({ title, featured = false, bestSeller = false, categoryId, link = "/products" }: { title: string; featured?: boolean; bestSeller?: boolean; categoryId?: string; link?: string }) {
  const [products, setProducts] = useState(categoryId ? [] : fallbackProducts);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { t } = useStore();
  useEffect(() => {
    const params = new URLSearchParams({ limit: "4" });
    if (featured) params.set("featured", "true");
    else if (bestSeller) params.set("bestSeller", "true");
    else if (categoryId) params.set("category", categoryId);
    else params.set("sort", "new");
    fetch(`/api/products?${params}`).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load products");
      const payload = await response.json() as { items?: ProductView[] };
      setProducts(payload.items ?? []);
    }).catch(() => setLoadError(true)).finally(() => setLoaded(true));
  }, [bestSeller, categoryId, featured]);
  return <section className="section wrap"><div className="section-heading"><div><p className="eyebrow">{featured ? "HANDPICKED FOR YOU" : "FRESH FINDS"}</p><h2>{title}</h2></div><Link className="text-link" href={link}>{t("viewAll")} <ArrowRight size={16} /></Link></div>
    {products.length ? <div className="product-grid">{products.map((product, index) => <ProductCard key={product._id ?? product.slug} product={product} index={index} />)}</div> : loaded && <p className="subtle">{t("noProducts")}</p>}
    {loadError && <p className="subtle">{t("catalogUnavailable")}</p>}
    {!loaded && <p className="subtle center">Updating the collection…</p>}
  </section>;
}
