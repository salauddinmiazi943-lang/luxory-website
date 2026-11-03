"use client";

import Link from "next/link";
import { cartLineKey, useStore } from "@/components/store-context";
import { quantityStep, unitLabel } from "@/lib/product-units";

export function CartPage() {
  const { cart, updateQuantity, removeFromCart, locale, t } = useStore();
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("cart")}</p><h1 className="page-title">{t("cart")}</h1>
    {!cart.length ? <div className="form-card"><p>{t("emptyCart")}</p><Link className="button-primary" href="/products">{t("continueShopping")}</Link></div> : <>
      <div style={{ overflowX: "auto" }}><table className="cart-table"><thead><tr><th>Product</th><th>{t("price")}</th><th>{t("quantity")}</th><th>{t("subtotal")}</th><th /></tr></thead><tbody>{cart.map((line) => {
        const key = cartLineKey(line);
        const unit = unitLabel(line.unit, locale);
        const step = quantityStep(line.unit);
        return <tr key={key}><td><div className="cart-item-name"><span className="mini-image">{line.image ? "✦" : "◉"}</span><span><Link href={`/products/${line.slug}`}>{line.name}</Link>{line.variantLabel && <small className="cart-variant-label">{line.variantLabel}</small>}</span></div></td><td>৳{line.price.toLocaleString("en-BD")} / {line.variantLabel ?? unit}</td><td><span className="quantity-control"><button aria-label="Decrease quantity" onClick={() => updateQuantity(key, line.quantity - step)}>−</button>{line.quantity.toLocaleString("en-BD")} {unit}<button aria-label="Increase quantity" onClick={() => updateQuantity(key, line.quantity + step)}>+</button></span></td><td>৳{(line.price * line.quantity).toLocaleString("en-BD")}</td><td><button className="inline-button" onClick={() => removeFromCart(key)}>{t("remove")}</button></td></tr>;
      })}</tbody></table></div>
      <p className="cart-total">{t("total")}: ৳{total.toLocaleString("en-BD")}</p><div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}><Link className="button-secondary" href="/products">{t("continueShopping")}</Link><Link className="button-primary" href="/checkout">{t("checkout")}</Link></div>
    </>}
  </div>;
}
