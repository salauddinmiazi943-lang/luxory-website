"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard, type ProductView } from "@/components/product-card";
import { useStore } from "@/components/store-context";

type CategoryAttribute = { key: string; name: { en: string; bn?: string }; type: string; options?: { value: string; name: { en: string; bn?: string }; hex?: string }[]; active?: boolean; displayOrder?: number };
type Category = { _id: string; slug: string; name: { en: string; bn?: string }; parentCategory?: string | null; attributeDefinitions?: CategoryAttribute[] };
export function ProductListing({ categorySlug }: { categorySlug?: string }) {
  const searchParams = useSearchParams();
  const { locale, t } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState(searchParams.get("sort") === "bestSeller" ? "bestSeller" : "new");
  const [discounted, setDiscounted] = useState(searchParams.get("discounted") === "true" || searchParams.get("offers") === "true");
  const [newArrivals, setNewArrivals] = useState(searchParams.get("new") === "true");
  const [availableOnly, setAvailableOnly] = useState(searchParams.get("availability") === "available");
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const query = searchParams.get("q") || "";
  const categoryId = useMemo(() => categories.find((category) => category.slug === categorySlug)?._id, [categories, categorySlug]);
  useEffect(() => {
    fetch("/api/categories?publicAll=true").then((response) => response.ok ? response.json() as Promise<{ items: Category[] }> : Promise.reject(new Error("Could not load categories"))).then((result) => setCategories(result.items ?? [])).catch(() => { setCategoriesError(true); setLoadError(true); }).finally(() => setCategoriesReady(true));
  }, []);
  useEffect(() => {
    if (categorySlug && !categoryId) {
      if (categoriesReady) Promise.resolve().then(() => {
        setProducts([]);
        setTotal(0);
        setLoading(false);
        if (categoriesError) setLoadError(true);
      });
      return;
    }
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (query) params.set("q", query);
    if (categoryId) params.set("category", categoryId);
    if (discounted) params.set("discounted", "true");
    if (newArrivals) params.set("new", "true");
    if (availableOnly) params.set("availability", "available");
    for (const [key, values] of Object.entries(attributeFilters)) {
      if (values.length) params.set(`attribute_${key}`, values.join(","));
    }
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (sort === "price_asc" || sort === "price_desc") params.set("sort", sort);
    if (sort === "bestSeller") params.set("bestSeller", "true");
    Promise.resolve().then(() => {
      setLoading(true);
      setLoadError(false);
      return fetch(`/api/products?${params}`);
    }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load products");
      const result = await response.json() as { items: ProductView[]; pages: number; total: number };
      setProducts(result.items ?? []);
      setPages(result.pages || 1);
      setTotal(result.total || 0);
    }).catch(() => { setProducts([]); setLoadError(true); }).finally(() => setLoading(false));
  }, [categoryId, categorySlug, categoriesError, categoriesReady, query, min, max, sort, page, discounted, newArrivals, availableOnly, attributeFilters]);
  const heading = categorySlug ? categories.find((category) => category.slug === categorySlug)?.name[locale] : t("allProducts");
  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{heading || t("shop")}</div>
    <h1 className="page-title">{heading || t("allProducts")}</h1>
    <div className="split-layout"><aside className="filter-panel">
      <h3>{t("categoriesFilter")}</h3><Link href="/products">{t("allProducts")}</Link>{categories.filter((category) => !category.parentCategory).map((category) => <Link key={category._id} href={`/category/${category.slug}`}>{category.name[locale] || category.name.en}</Link>)}
      {categoryId && categories.filter((category) => category.parentCategory === categoryId).length > 0 && <><h3 style={{ marginTop: 22 }}>Sub-categories</h3>{categories.filter((category) => category.parentCategory === categoryId).map((category) => <Link key={category._id} href={`/category/${category.slug}`}>{category.name[locale] || category.name.en}</Link>)}</>}
      {categoryId && (categories.find((category) => category._id === categoryId)?.attributeDefinitions ?? []).filter((attribute) => attribute.active !== false).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((attribute) => <div key={attribute.key}><h3 style={{ marginTop: 22 }}>{attribute.name[locale] || attribute.name.en}</h3>{attribute.type === "select" || attribute.type === "colour" || attribute.type === "multiselect" ? (attribute.options ?? []).map((option) => {
        const selected = attributeFilters[attribute.key]?.includes(option.value) ?? false;
        return <label className="admin-check" key={option.value}><input type="checkbox" checked={selected} onChange={(event) => {
          setPage(1);
          setAttributeFilters((current) => {
            const values = current[attribute.key] ?? [];
            return { ...current, [attribute.key]: event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value) };
          });
        }} />{option.hex && <span className="colour-swatch" style={{ background: option.hex }} />} {option.name[locale] || option.name.en}</label>;
      }) : <label className="admin-check"><input type="checkbox" checked={Boolean(attributeFilters[attribute.key]?.length)} onChange={(event) => {
        setPage(1);
        setAttributeFilters((current) => ({ ...current, [attribute.key]: event.target.checked ? ["true"] : [] }));
      }} />Available</label>}</div>)}
      <h3 style={{ marginTop: 22 }}>Availability</h3><label className="admin-check"><input type="checkbox" checked={availableOnly} onChange={(event) => { setPage(1); setAvailableOnly(event.target.checked); }} />In stock</label><label className="admin-check"><input type="checkbox" checked={newArrivals} onChange={(event) => { setPage(1); setNewArrivals(event.target.checked); }} />New arrivals</label>
      <h3 style={{ marginTop: 22 }}>{t("priceRange")}</h3><div className="form-grid"><div className="field"><label htmlFor="min">{t("from")}</label><input id="min" type="number" min="0" value={min} onChange={(event) => { setPage(1); setMin(event.target.value); }} /></div><div className="field"><label htmlFor="max">{t("to")}</label><input id="max" type="number" min="0" value={max} onChange={(event) => { setPage(1); setMax(event.target.value); }} /></div></div></aside>
      <section><div className="listing-toolbar"><span>{total} {t("items")}</span><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className={`button-secondary${discounted?"":" is-active"}`} style={{padding:"8px 12px"}} onClick={()=>{setPage(1);setDiscounted(false);}}>All</button><button type="button" className={`button-secondary${discounted?" is-active":""}`} style={{padding:"8px 12px"}} onClick={()=>{setPage(1);setDiscounted(true);}}>Offers</button><select aria-label="Sort products" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}><option value="new">{t("newest")}</option><option value="bestSeller">{t("bestSellerSort")}</option><option value="price_asc">{t("priceLowHigh")}</option><option value="price_desc">{t("priceHighLow")}</option></select></div></div>
        {loading ? <p className="subtle">{t("loading")}</p> : loadError ? <div className="form-card"><p>{t("catalogUnavailable")}</p></div> : products.length ? <div className="product-grid listing-grid">{products.map((product, index) => <ProductCard key={product._id ?? product.slug} product={product} index={index} />)}</div> : <div className="form-card"><p>{t("noProducts")}</p></div>}
        {pages > 1 && <div className="listing-toolbar" style={{ justifyContent: "center", gap: 20, marginTop: 30 }}><button className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("previous")}</button><span>{t("page")} {page} {t("of")} {pages}</span><button className="button-secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{t("next")}</button></div>}
      </section>
    </div>
  </div>;
}
