"use client";

import Link from "next/link";
import { ArrowUpRight, AtSign, MessageCircle, Send } from "lucide-react";
import { useStore } from "@/components/store-context";

export function SiteFooter() {
  const { t } = useStore();
  return <footer className="site-footer">
    <div className="newsletter"><div className="wrap newsletter-inner"><div><p className="eyebrow">THE ESHOP EDIT</p><h2>{t("newsletter")}</h2><p>{t("newsletterText")}</p></div><form className="newsletter-form" onSubmit={(event) => { event.preventDefault(); window.alert("Thank you for subscribing!"); }}><input type="email" placeholder={t("emailAddress")} required /><button>{t("subscribe")} <ArrowUpRight size={17} /></button></form></div></div>
    <div className="wrap footer-main"><div className="footer-about"><Link className="brand footer-brand" href="/"><span className="brand-mark">e</span><span>eshop<span className="brand-dot">.</span></span></Link><p>A little more joy in every day. Find technology and essentials that make life feel good.</p><div className="socials"><a href="mailto:hello@eshop.example" aria-label="Email"><AtSign size={17} /></a><a href="/contact" aria-label="Contact us"><MessageCircle size={17} /></a><a href="/vendor-application" aria-label="Become a vendor"><Send size={17} /></a></div></div>
      <div><h3>Explore</h3><Link href="/products">{t("allProducts")}</Link><Link href="/products?sort=new">{t("newArrival")}</Link><Link href="/products?sort=bestSeller">{t("bestSeller")}</Link><Link href="/vendor-application">{t("applyVendor")}</Link></div>
      <div><h3>Customer care</h3><Link href="/contact">{t("contactUs")}</Link><Link href="/account">{t("account")}</Link><Link href="/orders">{t("myOrders")}</Link><Link href="/cart">{t("cart")}</Link></div>
      <div><h3>Get in touch</h3><p>We’re here to help, every day.</p><a href="mailto:hello@eshop.example">hello@eshop.example</a><p>Dhaka, Bangladesh</p></div>
    </div><div className="wrap copyright"><span>© 2026 eshop. Made for the everyday.</span><span>Secure checkout · Cash on delivery</span></div>
  </footer>;
}
