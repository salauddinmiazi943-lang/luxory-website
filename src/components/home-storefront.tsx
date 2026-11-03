"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Truck, Sparkles, Gift } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductSection } from "@/components/product-section";

type Banner = { _id: string; image: string; title: { en: string; bn?: string }; subtitle: { en: string; bn?: string }; link: string };
type Category = { _id: string; slug: string; name: { en: string; bn?: string }; image?: string };

export function HomeStorefront() {
  const { t, locale } = useStore();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slide, setSlide] = useState(0);
  const [bannerDimensions, setBannerDimensions] = useState<{ id: string; width: number; height: number } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [storeError, setStoreError] = useState(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/banners").then((response) => response.ok ? response.json() as Promise<{ items: Banner[] }> : Promise.reject(new Error("Could not load banners"))),
      fetch("/api/categories").then((response) => response.ok ? response.json() as Promise<{ items: Category[] }> : Promise.reject(new Error("Could not load categories"))),
    ]).then(([bannerData, categoryData]) => {
      setBanners(bannerData.items ?? []);
      setCategories(categoryData.items ?? []);
    }).catch(() => setStoreError(true));
  }, []);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Date.UTC(2027, 3, 1) - Date.now()));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % banners.length), 5000);
    return () => window.clearInterval(timer);
  }, [banners.length]);
  const currentBanner = banners[slide];
  const title = currentBanner ? currentBanner.title[locale] || currentBanner.title.en : null;
  const bannerImage = currentBanner?.image?.startsWith("https://res.cloudinary.com/");
  const currentDimensions = bannerDimensions?.id === currentBanner?._id ? bannerDimensions : null;
  return <>
    {currentBanner && bannerImage ? <section className="hero hero-image-only">
      <Link href={currentBanner.link || "/products"} className="hero-image-only-link" aria-label="View banner">
        <Image src={currentBanner.image} alt={title || "Store banner"} width={currentDimensions?.width ?? 1200} height={currentDimensions?.height ?? 1200} priority sizes="100vw" onLoad={(event) => {
          const image = event.currentTarget;
          setBannerDimensions({ id: currentBanner._id, width: image.naturalWidth, height: image.naturalHeight });
        }} />
      </Link>
    </section> : <section className="hero"><div className="wrap hero-inner">
      <div className="hero-copy"><p className="eyebrow">{t("heroEyebrow")}</p><h1>{t("heroTitle")}<span>{t("heroAccent")}</span></h1><p>{t("heroBody")}</p><Link className="button-primary" href="/products">{t("shopNow")} <ArrowRight size={16} /></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit">◉</div></div>
    </div></section>}
    {storeError && <p className="wrap catalog-notice" role="status">{t("catalogUnavailable")}</p>}
    <div className="brand-strip"><div className="wrap brands"><span>SONY</span><span>soundcore</span><span>JBL</span><span>boAt</span><span>ANKER</span></div></div>
    <div className="wrap promo-grid">
      <div className="promo-card"><p>THE LITTLE EXTRAS</p><h3>{t("freeShipping")}</h3><span className="promo-icon"><Truck size={45} strokeWidth={1.2} /></span><small>{t("freeShippingText")}</small></div>
      <div className="promo-card"><p>THE SEASONAL EDIT</p><h3>{t("blackFriday")}</h3><span className="promo-icon"><Sparkles size={44} strokeWidth={1.2} /></span><small>{t("blackFridayText")}</small></div>
      <div className="promo-card"><p>A WARM WELCOME</p><h3>{t("firstOrder")}</h3><span className="promo-icon"><Gift size={42} strokeWidth={1.2} /></span><small>{t("firstOrderText")}</small></div>
    </div>
    <ProductSection title={t("newProducts")} />
    <ProductSection title={t("featured")} featured />
    <section className="section wrap"><div className="section-heading"><div><p className="eyebrow">MADE FOR YOUR EVERYDAY</p><h2>{t("categories")}</h2></div><Link className="text-link" href="/products">{t("viewAll")} <ArrowRight size={16} /></Link></div>
      <div className="category-grid">{(categories.length ? categories : [
        { _id: "smartphones", slug: "smartphones", name: { en: "Smartphones", bn: "স্মার্টফোন" } },
        { _id: "headphones", slug: "headphones", name: { en: "Headphones", bn: "হেডফোন" } },
        { _id: "smart-watches", slug: "smart-watches", name: { en: "Smart watches", bn: "স্মার্ট ঘড়ি" } },
        { _id: "accessories", slug: "accessories", name: { en: "Accessories", bn: "আনুষঙ্গিক" } },
      ]).slice(0, 8).map((category, index) => <Link className="category-tile" key={category._id} href={`/category/${category.slug}`}>{category.image?.startsWith("https://res.cloudinary.com/") && <Image src={category.image} alt="" fill sizes="(max-width: 650px) 50vw, 25vw" style={{ objectFit: "cover", opacity: .25 }} />}<strong>{category.name[locale] || category.name.en}</strong><span>{["◉", "◌", "⌚", "◈"][index % 4]}</span></Link>)}</div>
    </section>
    {categories.slice(0, 3).map((category) => <ProductSection key={category._id} title={category.name[locale] || category.name.en} categoryId={category._id} link={`/category/${category.slug}`} />)}
    <ProductSection title={t("bestSeller")} bestSeller />
    <section className="sale-banner"><div className="wrap sale-inner"><div><p className="eyebrow">A FRESH SEASON, A FRESH START</p><h2>{t("springSale")}</h2><p>{t("springSaleText")}</p><div className="countdown-timer" aria-label="Spring sale countdown"><CountdownUnit label="DAYS" value={Math.floor(remaining / 86_400_000)} /><CountdownUnit label="HRS" value={Math.floor((remaining / 3_600_000) % 24)} /><CountdownUnit label="MIN" value={Math.floor((remaining / 60_000) % 60)} /><CountdownUnit label="SEC" value={Math.floor((remaining / 1000) % 60)} /></div><Link href="/products" className="button-primary">{t("explore")} <ArrowRight size={16} /></Link></div><div className="sale-bubbles">✳　✦</div></div></section>
    <section className="wrap faq"><h2>{t("faqTitle")}</h2><div><details><summary>{t("deliveryQuestion")}</summary><p>{t("deliveryAnswer")}</p></details><details><summary>{t("codQuestion")}</summary><p>{t("codAnswer")}</p></details><details><summary>{t("vendorQuestion")}</summary><p>{t("vendorAnswer")}</p></details></div></section>
  </>;
}

function CountdownUnit({ label, value }: { label: string; value: number }) {
  return <div className="countdown-unit"><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>;
}
