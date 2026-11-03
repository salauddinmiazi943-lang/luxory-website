"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, ShoppingBag, UserRound, Menu, X, ChevronDown } from "lucide-react";
import { useStore } from "@/components/store-context";

export function SiteHeader() {
  const { t, locale, setLocale, cart } = useStore();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(`/products${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  };
  return (
    <header className="site-header">
      <div className="topline"><div className="wrap top-line-inner"><span>{t("topline")}</span><div className="top-links"><Link href="/contact">{t("contact")}</Link><button onClick={() => setLocale(locale === "en" ? "bn" : "en")}>{locale === "en" ? "বাংলা" : "English"}</button></div></div></div>
      <div className="wrap main-header">
        <button aria-label="Toggle navigation" className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <Link className="brand" href="/"><span className="brand-mark">e</span><span>eshop<span className="brand-dot">.</span></span></Link>
        <form className="search-box" onSubmit={submitSearch}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} /><button aria-label="Search"><Search size={20} /></button></form>
        <div className="header-actions"><Link href="/account" className="header-action"><UserRound size={20} /><span>{t("account")}</span></Link><Link href="/cart" className="header-action cart-action"><span className="cart-icon"><ShoppingBag size={21} /><b>{cart.reduce((sum, item) => sum + item.quantity, 0)}</b></span><span>{t("cart")}</span></Link></div>
      </div>
      <nav className={`nav-bar ${menuOpen ? "nav-open" : ""}`}><div className="wrap nav-inner">
        <Link className="nav-category" href="/products"><Menu size={16} />{t("allCategories")}<ChevronDown size={14} /></Link>
        <Link href="/products">{t("products")}</Link><Link href="/blog">{t("blog")}</Link><Link href="/products?sort=bestSeller">{t("bestSeller")}</Link><Link href="/products?sort=new">{t("newArrival")}</Link><Link href="/vendor-application">{t("applyVendor")}</Link><Link href="/contact">{t("contact")}</Link>
      </div></nav>
    </header>
  );
}
