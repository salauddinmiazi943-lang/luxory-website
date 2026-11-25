"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, AtSign, MessageCircle, Send } from "lucide-react";
import { useStore } from "@/components/store-context";

export function SiteFooter() {
  const pathname = usePathname();
  const { t } = useStore();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNote(""); setNoteError(false); setSubscribing(true);
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json() as { ok?: boolean; alreadySubscribed?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || t("subscribeError"));
      setNote(result.alreadySubscribed ? t("alreadySubscribed") : t("subscribeSuccess"));
      setEmail("");
    } catch (reason) {
      setNoteError(true);
      setNote(reason instanceof Error && reason.name === "TimeoutError" ? t("subscribeError") : reason instanceof Error && reason.message ? reason.message : t("subscribeError"));
    } finally { setSubscribing(false); }
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <footer className="site-footer">
    <div className="newsletter"><div className="wrap newsletter-inner"><div><p className="eyebrow">{t("eyebrowInbox")}</p><h2>{t("newsletter")}</h2><p>{t("newsletterText")}</p></div><div className="newsletter-field"><form className="newsletter-form" onSubmit={subscribe}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailAddress")} required maxLength={254} disabled={subscribing} /><button type="submit" disabled={subscribing}>{subscribing ? "…" : t("subscribe")} <ArrowUpRight size={17} /></button></form>{note && <p className={noteError ? "newsletter-note error" : "newsletter-note"} role="status">{note}</p>}</div></div></div>
    <div className="footer-main-wrap">    <div className="wrap footer-main">      <div className="footer-about"><Link className="brand footer-brand" href="/" aria-label="Luxora Global Trade"><Image src="/images/luxora-logo-removebg-preview.png" alt="Luxora Global Trade" className="brand-logo-img" width={420} height={140} sizes="(max-width: 650px) 170px, 220px" /></Link><p>{t("footerAbout")}</p><div className="socials"><a href="https://www.facebook.com/share/1K3zxrNgm8/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a><a href="mailto:luxoraglobaltrade@gmail.com" aria-label="Email"><AtSign size={17} /></a><a href="/contact" aria-label="Contact us"><MessageCircle size={17} /></a><a href="/vendor-application" aria-label="Become a vendor"><Send size={17} /></a></div></div>
      <div><h3>{t("footerExplore")}</h3><Link href="/products">{t("allProducts")}</Link><Link href="/products?sort=new">{t("newArrival")}</Link><Link href="/products?sort=bestSeller">{t("bestSeller")}</Link><Link href="/vendor-application">{t("applyVendor")}</Link><Link href="/business-application">{t("resellerWholesaler")}</Link></div>
      <div><h3>{t("footerCustomerCare")}</h3><Link href="/contact">{t("contactUs")}</Link><Link href="/account">{t("account")}</Link><Link href="/orders">{t("myOrders")}</Link><Link href="/cart">{t("cart")}</Link></div>
      <div><h3>{t("footerGetInTouch")}</h3><p>{t("footerHelpText")}</p><a href="mailto:luxoraglobaltrade@gmail.com">luxoraglobaltrade@gmail.com</a><p>{t("footerLocation")}</p></div>
    </div></div><div className="copyright-wrap"><div className="wrap copyright"><span>{t("footerRights")}</span><span>{t("footerSecure")}</span></div></div>
  </footer>;
}
