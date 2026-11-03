"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";

type Order = { _id: string; total: number; status: string; paymentMethod: string; createdAt: string; items: { title: string; variantLabel?: string; unit?: string; unitPrice: number; quantity: number; status: string }[] };
export function OrdersPage() {
  const { locale, t } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/orders").then(async (response) => {
      const result = await response.json() as { items?: Order[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Sign in to view your orders");
      setOrders(result.items ?? []);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load orders")).finally(() => setLoading(false));
  }, []);
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("myOrders")}</p><h1 className="page-title">{t("myOrders")}</h1>
    {loading ? <p>{t("loading")}</p> : error ? <div className="form-card"><p className="form-error">{error}</p><Link className="button-primary" href="/account">{t("signIn")}</Link></div> : orders.length ? <div className="dashboard-card"><table className="data-table"><thead><tr><th>{t("order")}</th><th>{t("products")}</th><th>{t("date")}</th><th>{t("total")}</th><th>{t("status")}</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td>#{order._id.slice(-8).toUpperCase()}</td><td>{order.items.map((item) => `${item.title}${item.variantLabel ? ` (${item.variantLabel})` : ""} × ${item.quantity.toLocaleString("en-BD")} ${unitLabel(item.unit, locale)} · ৳${item.unitPrice.toLocaleString("en-BD")} each`).join(", ")}</td><td>{new Date(order.createdAt).toLocaleDateString()}</td><td>৳{order.total.toLocaleString("en-BD")}</td><td><span className="status-pill">{order.status}</span></td></tr>)}</tbody></table></div> : <div className="form-card"><p>{t("noOrders")}</p><Link className="button-primary" href="/products">{t("startShopping")}</Link></div>}
  </div>;
}
