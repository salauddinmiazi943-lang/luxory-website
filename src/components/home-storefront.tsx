"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Truck, Sparkles, Gift, Crown } from "lucide-react";
import { useStore } from "@/components/store-context";
import { ProductSection } from "@/components/product-section";
import { HomeCategorySections } from "@/components/home-category-sections";
import { HeroSlider } from "@/components/hero-slider";
import { HERO_AUTOPLAY_MS, HERO_SLIDES, HERO_TRANSITION_MS, type HeroSlide } from "@/config/banners";

type Banner = { _id: string; image: string; title: { en: string; bn?: string }; subtitle: { en: string; bn?: string }; buttonText?: { en?: string; bn?: string }; link?: string; bgColor?: string };
type Category = { _id: string; slug: string; name: { en: string; bn?: string }; image?: string };

export function HomeStorefront() {
  const { t, locale } = useStore();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  const managed: HeroSlide[] = banners.map((banner) => {
    const title = banner.title?.[locale] || banner.title?.en || "";
    return {
      id: banner._id,
      desktopImage: banner.image,
      mobileImage: banner.image,
      alt: title || "Store banner",
      categoryUrl: banner.link?.trim() ? banner.link : "/products",
      title: banner.title,
      subtitle: banner.subtitle,
      buttonText: banner.buttonText,
    };
  });
  const slides: HeroSlide[] = managed.length >= 2 ? managed : [...managed, ...HERO_SLIDES];
  return <>
    <HeroSlider
      slides={slides}
      locale={locale}
      autoplayMs={HERO_AUTOPLAY_MS}
      transitionMs={HERO_TRANSITION_MS}
      labels={{
        featured: t("featuredOffers"),
        previous: t("previousSlide"),
        next: t("nextSlide"),
        pause: t("pauseSlideshow"),
        play: t("playSlideshow"),
        goTo: (index) => `${t("goToSlide")} ${index}`,
      }}
    />
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
        <div className="hero-category-badge" aria-label={t("productsCount")}><Crown size={18} aria-hidden="true" /><span>{t("productsCount")}</span></div>
      </div>
    </section>}
    <div className="wrap promo-grid">
      <div className="promo-card"><p>{t("eyebrowExtras")}</p><h3>{t("freeShipping")}</h3><span className="promo-icon"><Truck size={45} strokeWidth={1.2} /></span><small>{t("freeShippingText")}</small></div>
      <div className="promo-card"><p>{t("eyebrowSeasonal")}</p><h3>{t("blackFriday")}</h3><span className="promo-icon"><Sparkles size={44} strokeWidth={1.2} /></span><small>{t("blackFridayText")}</small></div>
      <div className="promo-card"><p>{t("eyebrowWelcome")}</p><h3>{t("firstOrder")}</h3><span className="promo-icon"><Gift size={42} strokeWidth={1.2} /></span><small>{t("firstOrderText")}</small></div>
    </div>
    <ProductSection title={t("newProducts")} />
    <ProductSection title={t("featured")} featured />
    <ProductSection title={t("bestSeller")} bestSeller />
      <HomeCategorySections />
    <section className="sale-banner"><div className="wrap sale-inner"><div><p className="eyebrow">{t("eyebrowFreshSeason")}</p><h2>{t("springSale")}</h2><p>{t("springSaleText")}</p><div className="countdown-timer" aria-label="Spring sale countdown"><CountdownUnit label={t("countdownDays")} value={Math.floor(remaining / 86_400_000)} /><CountdownUnit label={t("countdownHours")} value={Math.floor((remaining / 3_600_000) % 24)} /><CountdownUnit label={t("countdownMinutes")} value={Math.floor((remaining / 60_000) % 60)} /><CountdownUnit label={t("countdownSeconds")} value={Math.floor((remaining / 1000) % 60)} /></div><Link href="/products" className="button-primary">{t("explore")} <ArrowRight size={16} /></Link></div><div className="sale-bubbles">✳　✦</div></div></section>
    <section className="wrap faq"><h2>{t("faqTitle")}</h2><div><details><summary>{t("deliveryQuestion")}</summary><p>{t("deliveryAnswer")}</p></details><details><summary>{t("codQuestion")}</summary><p>{t("codAnswer")}</p></details><details><summary>{t("vendorQuestion")}</summary><p>{t("vendorAnswer")}</p></details></div></section>
  </>;
}

function CountdownUnit({ label, value }: { label: string; value: number }) {
  return <div className="countdown-unit"><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>;
}
