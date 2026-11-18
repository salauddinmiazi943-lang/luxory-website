export type HeroSlide = {
  id: string;
  desktopImage: string;
  mobileImage: string;
  alt: string;
  categoryUrl: string;
  title?: { en: string; bn?: string };
  subtitle?: { en: string; bn?: string };
  buttonText?: { en?: string; bn?: string };
};

export const HERO_AUTOPLAY_MS = 7500;
export const HERO_TRANSITION_MS = 800;
export const HERO_SWIPE_THRESHOLD = 45;

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "sample-smartphones",
    desktopImage: "/images/demo/banner-1-desktop.svg",
    mobileImage: "/images/demo/banner-1-mobile.svg",
    alt: "Smartphone offer banner",
    categoryUrl: "/category/smartphones",
    title: { en: "Smartphones, refreshed", bn: "স্মার্টফোন, একদম নতুনভাবে" },
    subtitle: { en: "New arrivals every week with free delivery", bn: "প্রতি সপ্তাহে নতুন কালেকশন, ফ্রি ডেলিভারি" },
    buttonText: { en: "Shop smartphones", bn: "স্মার্টফোন দেখুন" },
  },
  {
    id: "sample-perfumes",
    desktopImage: "/images/demo/banner-2-desktop.svg",
    mobileImage: "/images/demo/banner-2-mobile.svg",
    alt: "Perfume and fragrance offer banner",
    categoryUrl: "/category/perfumes-fragrances-mwbudtpc",
    title: { en: "Signature scents", bn: "সিগনেচার সুগন্ধি" },
    subtitle: { en: "Perfumes and fragrances up to 30% off", bn: "পারফিউম ও ফ্রেগ্র্যান্সে ৩০% পর্যন্ত ছাড়" },
    buttonText: { en: "Shop fragrances", bn: "সুগন্ধি দেখুন" },
  },
  {
    id: "sample-headphones",
    desktopImage: "/images/demo/banner-3-desktop.svg",
    mobileImage: "/images/demo/banner-3-mobile.svg",
    alt: "Headphone offer banner",
    categoryUrl: "/category/headphones",
    title: { en: "Sound that moves you", bn: "মন ছুঁয়ে যাওয়া সাউন্ড" },
    subtitle: { en: "Wireless headphones with 40-hour battery", bn: "৪০ ঘণ্টা ব্যাটারির ওয়্যারলেস হেডফোন" },
    buttonText: { en: "Shop headphones", bn: "হেডফোন দেখুন" },
  },
];