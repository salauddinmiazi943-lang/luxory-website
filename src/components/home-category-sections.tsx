"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductSection } from "@/components/product-section";
import { useStore } from "@/components/store-context";

type Category = { _id: string; slug: string; name?: { en?: string; bn?: string }; isActive?: boolean; order?: number };

export function HomeCategorySections() {
  const [categories, setCategories] = useState<Category[]>([]);
  const { t, locale } = useStore();
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((data) => {
      const items = Array.isArray(data.items) ? data.items as Category[] : [];
      setCategories(items.filter((c) => c.isActive !== false));
    }).catch(() => undefined);
  }, []);
  const active = useMemo(() => categories.slice().sort((a,b)=>(a.order??0)-(b.order??0)), [categories]);
  if (!active.length) return null;
  return <>
    {active.map((category) => {
      const title = locale === "bn" ? (category.name?.bn || category.name?.en || category.slug) : (category.name?.en || category.name?.bn || category.slug);
      const base = `/category/${category.slug}`;
      return <div key={category._id}>
        <ProductSection title={title} eyebrow={t("eyebrowCategory")} categoryId={category._id} link={base} limit={4} allowFallback={false} />
        <ProductSection title={`${title} ${t("offersSuffix")}`} eyebrow={t("eyebrowOfferProducts")} categoryId={category._id} discounted link={`${base}?discounted=true`} limit={4} allowFallback={false} />
      </div>;
    })}
  </>;
}
