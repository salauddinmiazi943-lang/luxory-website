"use client";

import Link from "next/link";
import { Banknote, MessageCircle, PackageCheck, Store } from "lucide-react";
import { useStore } from "@/components/store-context";

export function ServicesPage() {
  const { t } = useStore();
  const services = [
    { icon: PackageCheck, title: t("deliveryQuestion"), description: t("deliveryAnswer") },
    { icon: Banknote, title: t("codQuestion"), description: t("codAnswer") },
    { icon: Store, title: t("vendorQuestion"), description: t("vendorAnswer"), href: "/vendor-application" },
    { icon: MessageCircle, title: t("contactUs"), description: t("contactServiceText"), href: "/contact" },
  ];

  return <div className="page-shell">
    <div className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("services")}</div>
    <p className="eyebrow">{t("services")}</p>
    <h1 className="page-title">{t("servicesTitle")}</h1>
    <div className="service-grid">{services.map(({ icon: Icon, title, description, href }) => <article className="service-card" key={title}>
      <span className="service-icon"><Icon size={22} strokeWidth={1.8} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && <Link className="text-link" href={href}>{title === t("vendorQuestion") ? t("applyVendor") : t("contactUs")}</Link>}
    </article>)}</div>
  </div>;
}
