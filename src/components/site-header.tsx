"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, ShoppingBag, UserRound, Menu, X, ChevronDown } from "lucide-react";
import { useStore } from "@/components/store-context";

type ProductSuggestion = { slug: string; title: { en: string; bn?: string } };

export function SiteHeader() {
  const { t, locale, setLocale, cart } = useStore();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const search = query.trim();
    if (!search) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: search, suggestions: "true" });
        const response = await fetch(`/api/products?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load product suggestions");
        const result = await response.json() as { items: ProductSuggestion[] };
        setSuggestions(result.items ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionsError(true);
        }
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchOpen(false);
    router.push(`/products${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  };
  return (
    <header className="site-header">
      <div className="topline"><div className="wrap top-line-inner"><span>{t("topline")}</span><div className="top-links"><Link href="/contact">{t("contact")}</Link><button onClick={() => setLocale(locale === "en" ? "bn" : "en")}>{locale === "en" ? "বাংলা" : "English"}</button></div></div></div>
      <div className="wrap main-header">
        <button aria-label="Toggle navigation" className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <Link className="brand" href="/" aria-label="Luxora Global Trade">
          <Image src="/images/luxora-logo-removebg-preview.png" alt="Luxora Global Trade" className="brand-logo-img" width={420} height={140} sizes="(max-width: 650px) 160px, (max-width: 900px) 200px, 260px" priority />
        </Link>
        <form
          className="search-box"
          role="search"
          onSubmit={submitSearch}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setSearchOpen(false);
          }}
        >
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setSuggestions([]);
              setSuggestionsLoading(Boolean(value.trim()));
              setSuggestionsError(false);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                event.currentTarget.blur();
              }
            }}
            placeholder={t("search")}
            aria-label={t("search")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && Boolean(query.trim())}
            aria-controls="product-search-suggestions"
          />
          <button type="submit" aria-label="Search"><Search size={20} /></button>
          {searchOpen && query.trim() && <div className="search-suggestions" id="product-search-suggestions">
            {suggestionsLoading ? <p role="status">{t("searchingProducts")}</p>
              : suggestionsError ? <p role="alert">{t("searchSuggestionsError")}</p>
                : suggestions.length > 0 ? suggestions.map((product) => (
                  <Link key={product.slug} href={`/products/${encodeURIComponent(product.slug)}`} onClick={() => setSearchOpen(false)}>
                    {product.title[locale] || product.title.en}
                  </Link>
                ))
                  : <p role="status">{t("noMatchingProducts")}</p>}
          </div>}
        </form>
        <div className="header-actions"><Link href="/account" className="header-action"><UserRound size={20} /><span>{t("account")}</span></Link><Link href="/cart" className="header-action cart-action"><span className="cart-icon"><ShoppingBag size={21} /><b>{cart.reduce((sum, item) => sum + item.quantity, 0)}</b></span><span>{t("cart")}</span></Link></div>
      </div>
      <nav className={`nav-bar ${menuOpen ? "nav-open" : ""}`}><div className="wrap nav-inner">
        <Link className="nav-category" href="/products"><Menu size={16} />{t("allCategories")}<ChevronDown size={14} /></Link>
        <Link href="/products">{t("products")}</Link><Link href="/blog">{t("blog")}</Link>        <Link href="/products?sort=bestSeller">{t("bestSeller")}</Link><Link href="/products?sort=new">{t("newArrival")}</Link><Link href="/products?sort=offer">{t("todayOffer")}</Link><Link href="/vendor-application">{t("applyVendor")}</Link><Link href="/reseller">{t("reseller")}</Link><Link href="/wholesaler">{t("wholesaler")}</Link><Link href="/contact">{t("contact")}</Link>
      </div></nav>
    </header>
  );
}
