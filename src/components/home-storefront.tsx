"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Truck, Sparkles, Gift, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductSection } from "@/components/product-section";
import { HomeCategorySections } from "@/components/home-category-sections";

type Banner = { _id: string; image: string; title: { en: string; bn?: string }; subtitle: { en: string; bn?: string }; buttonText?: { en?: string; bn?: string }; link?: string; bgColor?: string };
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
  const title = currentBanner ? (currentBanner.title?.[locale] || currentBanner.title?.en || null) : null;
  const subtitle = currentBanner ? (currentBanner.subtitle?.[locale] || currentBanner.subtitle?.en || null) : null;
  const buttonText = currentBanner ? ((currentBanner.buttonText?.[locale] || currentBanner.buttonText?.en || "").trim() || t("shopNow") || "Shop Now") : "";
  const bannerImage = typeof currentBanner?.image === "string" && /^https?:\/\//.test(currentBanner.image);
  const currentDimensions = bannerDimensions?.id === currentBanner?._id ? bannerDimensions : null;
  const bannerCount = banners.length;
  const hasLink = typeof currentBanner?.link === "string" && currentBanner.link.trim() !== "";
  const rawBg = typeof currentBanner?.bgColor === "string" ? currentBanner.bgColor.trim() : "";
  const sliderBackground = rawBg && /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(|hsla?\(|[a-z]+(-[a-z]+)?|var\(--[\w-]+\)|linear-gradient\(|radial-gradient\()/i.test(rawBg) ? rawBg : undefined;
  const bannerMedia = currentBanner ? <Image src={currentBanner.image} alt={title || "Store banner"} width={currentDimensions?.width ?? 1600} height={currentDimensions?.height ?? 900} priority={slide === 0} sizes="100vw" unoptimized style={{ width: "100%", height: "auto" }} onLoad={(event) => {
    const image = event.currentTarget;
    setBannerDimensions({ id: currentBanner._id, width: image.naturalWidth, height: image.naturalHeight });
  }} /> : null;
  const goPrev = () => setSlide((current) => (current - 1 + bannerCount) % bannerCount);
  const goNext = () => setSlide((current) => (current + 1) % bannerCount);
  return <>
    {currentBanner && bannerImage ? <section className="hero hero-image-only hero-slider" aria-label="Banner slider" style={sliderBackground ? { background: sliderBackground } : undefined}>
      <div className="hero-image-only-link hero-image-only-static">{bannerMedia}</div>
      <div className="hero-slider-overlay" style={sliderBackground ? { background: `linear-gradient(90deg, color-mix(in srgb, ${sliderBackground} 84%, #03271F) 0%, color-mix(in srgb, ${sliderBackground} 34%, transparent) 48%, rgba(3,39,31,0) 78%)` } : undefined}>
        <div className="hero-slider-content">
          {title && <h2 className="hero-slider-title">{title}</h2>}
          {subtitle && <p className="hero-slider-subtitle">{subtitle}</p>}
          {hasLink ? <Link href={currentBanner.link!} className="button-primary hero-slider-shop">{buttonText} <ArrowRight size={16} /></Link> : <span className="button-primary hero-slider-shop is-static" aria-disabled="true">{buttonText}</span>}
        </div>
      </div>
      {bannerCount > 1 && <>
        <button type="button" className="hero-slider-arrow prev" aria-label="Previous banner" onClick={goPrev}><ChevronLeft size={22} /></button>
        <button type="button" className="hero-slider-arrow next" aria-label="Next banner" onClick={goNext}><ChevronRight size={22} /></button>
        <div className="hero-slider-dots" role="tablist" aria-label="Banner slides">
          {banners.map((banner, index) => <button key={banner._id} type="button" role="tab" aria-selected={index === slide} aria-label={`Go to banner ${index + 1}`} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} />)}
        </div>
      </>}
    </section> : <section className="hero"><div className="wrap hero-inner">
      <div className="hero-copy"><p className="eyebrow">{t("todayOffer")}</p><h1>{t("todayOfferTitle")}</h1><Link className="button-primary" href="/products">{t("shopNow")} <ArrowRight size={16} /></Link></div>
      <div className="hero-art" aria-hidden="true"></div>
    </div></section>}
    {storeError && <p className="wrap catalog-notice" role="status">{t("catalogUnavailable")}</p>}
    {(categories.length > 0) && <section className="hero-category-strip" aria-label={t("categories")}>
      <div className="wrap hero-category-strip-inner">
        <div className="hero-category-row">
          {categories.slice(0, 8).map((category) => {
            const name = category.name[locale] || category.name.en;
            return <Link className="hero-category-card" key={`hero-cat-${category._id}`} href={`/category/${category.slug}`}>
              <span className="hero-category-image">
                {category.image?.startsWith("https://res.cloudinary.com/") ? <Image src={category.image} alt={name} width={30} height={30} unoptimized style={{ width: 30, height: 30, objectFit: "contain" }} /> : <span className="hero-category-fallback" aria-hidden="true">{(name || "C").slice(0, 1)}</span>}
              </span>
              <strong>{name}</strong>
            </Link>;
          })}
        </div>
        <div className="hero-category-badge" aria-label="60+ Products"><Crown size={18} aria-hidden="true" /><span>60+ Products</span></div>
      </div>
    </section>}
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
      <HomeCategorySections />
    <section className="sale-banner"><div className="wrap sale-inner"><div><p className="eyebrow">A FRESH SEASON, A FRESH START</p><h2>{t("springSale")}</h2><p>{t("springSaleText")}</p><div className="countdown-timer" aria-label="Spring sale countdown"><CountdownUnit label="DAYS" value={Math.floor(remaining / 86_400_000)} /><CountdownUnit label="HRS" value={Math.floor((remaining / 3_600_000) % 24)} /><CountdownUnit label="MIN" value={Math.floor((remaining / 60_000) % 60)} /><CountdownUnit label="SEC" value={Math.floor((remaining / 1000) % 60)} /></div><Link href="/products" className="button-primary">{t("explore")} <ArrowRight size={16} /></Link></div><div className="sale-bubbles">✳　✦</div></div></section>
    <section className="wrap faq"><h2>{t("faqTitle")}</h2><div><details><summary>{t("deliveryQuestion")}</summary><p>{t("deliveryAnswer")}</p></details><details><summary>{t("codQuestion")}</summary><p>{t("codAnswer")}</p></details><details><summary>{t("vendorQuestion")}</summary><p>{t("vendorAnswer")}</p></details></div></section>
  </>;
}

function CountdownUnit({ label, value }: { label: string; value: number }) {
  return <div className="countdown-unit"><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>;
}
