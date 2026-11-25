"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Heart, Home, LayoutGrid, ShoppingBag, UserRound } from "lucide-react";
import { useStore } from "@/components/store-context";

export function SiteBottomNav() {
  const pathname = usePathname();
  const { t, cart, wishlist } = useStore();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const items = [
    { href: "/", label: t("home"), icon: Home, count: 0 },
    { href: "/products", label: t("categoriesFilter"), icon: LayoutGrid, count: 0 },
    { href: "/services", label: t("services"), icon: BriefcaseBusiness, count: 0 },
    { href: "/wishlist", label: t("wishlist"), icon: Heart, count: wishlist.length },
    { href: "/account", label: t("account"), icon: UserRound, count: 0 },
    { href: "/cart", label: t("cart"), icon: ShoppingBag, count: cartCount },
  ];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/products") return pathname.startsWith("/products") || pathname.startsWith("/category/");
    if (href === "/cart") return pathname === "/cart" || pathname === "/checkout" || pathname.startsWith("/order-confirmation/");
    if (href === "/account") return ["/account", "/orders", "/vendor", "/admin"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return <nav className="site-bottom-nav" aria-label="Main navigation">
    {items.map(({ href, label, icon: Icon, count }) => {
      const active = isActive(href);
      return <Link key={href} href={href} className={`site-bottom-nav-item${active ? " is-active" : ""}`} aria-label={count ? `${label}, ${count} items` : label} aria-current={active ? "page" : undefined}>
        <span className="site-bottom-nav-icon"><Icon size={20} strokeWidth={active ? 2.2 : 1.8} />{count > 0 && <span className="site-bottom-nav-count">{count > 99 ? "99+" : count}</span>}</span>
        <span className="site-bottom-nav-label">{label}</span>
      </Link>;
    })}
  </nav>;
}
