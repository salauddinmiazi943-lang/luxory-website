"use client";

import Link from "next/link";
import { ArrowUpRight, AtSign, MessageCircle, Send } from "lucide-react";
import { useStore } from "@/components/store-context";

export function SiteFooter() {
  const { t } = useStore();
  return <footer className="site-footer">
    <div className="newsletter"><div className="wrap newsletter-inner"><div><p className="eyebrow">THE ESHOP EDIT</p><h2>{t("newsletter")}</h2><p>{t("newsletterText")}</p></div><form className="newsletter-form" onSubmit={(event) => { event.preventDefault(); window.alert("Thank you for subscribing!"); }}><input type="email" placeholder={t("emailAddress")} required /><button>{t("subscribe")} <ArrowUpRight size={17} /></button></form></div></div>
    <div className="footer-main-wrap">    <div className="wrap footer-main"><div className="footer-about"><Link className="brand footer-brand" href="/" aria-label="Luxora Global Trade"><img src="/logo.png" alt="Luxora Global Trade" className="brand-logo" /></Link><p>A little more joy in every day. Find technology and essentials that make life feel good.</p><div className="socials"><a href="https://www.facebook.com/share/1K3zxrNgm8/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a><a href="mailto:luxoraglobaltrade@gmail.com" aria-label="Email"><AtSign size={17} /></a><a href="/contact" aria-label="Contact us"><MessageCircle size={17} /></a><a href="/vendor-application" aria-label="Become a vendor"><Send size={17} /></a></div></div>
      <div><h3>Explore</h3><Link href="/products">{t("allProducts")}</Link><Link href="/products?sort=new">{t("newArrival")}</Link><Link href="/products?sort=bestSeller">{t("bestSeller")}</Link><Link href="/vendor-application">{t("applyVendor")}</Link></div>
      <div><h3>Customer care</h3><Link href="/contact">{t("contactUs")}</Link><Link href="/account">{t("account")}</Link><Link href="/orders">{t("myOrders")}</Link><Link href="/cart">{t("cart")}</Link><Link href="/admin/login" className="super-admin-link">Super Admin Login</Link></div>
      <div><h3>Get in touch</h3><p>We’re here to help, every day.</p><a href="mailto:luxoraglobaltrade@gmail.com">luxoraglobaltrade@gmail.com</a><p>Dhaka, Bangladesh</p></div>
    </div></div><div className="copyright-wrap"><div className="wrap copyright"><span>© 2026 Luxora Global Trade. Made for the everyday.</span><span>Secure checkout · Cash on delivery · <Link href="/admin/login">Super Admin Login</Link></span></div></div>
  </footer>;
}
