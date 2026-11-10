"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store-context";
import { unitLabel } from "@/lib/product-units";

type Order = {
  _id: string; subtotal?: number; deliveryCharge?: number; total: number; status: string; paymentMethod: string; createdAt: string;
  items: { productId?: string; variantId?: string; title: string; variantLabel?: string; unit?: string; originalPrice?: number; unitPrice: number; discountPercent?: number; lineTotal?: number; quantity: number; status: string }[];
  delivery?: {
    verificationStatus?: string; deliveredAt?: string; notes?: string;
    notifications?: { message: string; createdAt: string; readAt?: string }[];
    reports?: { reason: string; details?: string; status: string; createdAt: string }[];
  };
};
export function OrdersPage() {
  const { locale, t } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    fetch("/api/orders").then(async (response) => {
      const result = await response.json() as { items?: Order[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Sign in to view your orders");
      setOrders(result.items ?? []);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load orders")).finally(() => setLoading(false));
  }, []);
  async function markNotificationsRead(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}/delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_notifications" }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setReportError(result.error || "Could not update notifications");
      return;
    }
    const refreshed = await fetch("/api/orders");
    const data = await refreshed.json() as { items?: Order[]; error?: string };
    if (!refreshed.ok) {
      setReportError(data.error || "Could not refresh notifications");
      return;
    }
    setOrders(data.items ?? []);
  }
  async function reportDelivery(orderId: string) {
    setReportError(""); setNotice("");
    const reasons = ["not_received", "late", "missing_items", "damaged", "other"] as const;
    const selected = window.prompt("Choose a reason: 1) Not received  2) Late  3) Missing items  4) Damaged  5) Other", "1");
    if (selected === null) return;
    const reason = reasons[Number(selected) - 1];
    if (!reason) { setError("Choose a reason from 1 to 5."); return; }
    const details = window.prompt("Optional details (please do not include sensitive information)", "");
    if (details === null) return;
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report", reason, details }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not report this delivery issue");
      setNotice("Your delivery report was sent to our team.");
      const refreshed = await fetch("/api/orders");
      if (!refreshed.ok) throw new Error("Report sent, but orders could not be refreshed.");
      const data = await refreshed.json() as { items?: Order[] };
      setOrders(data.items ?? []);
    } catch (reason) {
      setReportError(reason instanceof Error ? reason.message : "Could not report this delivery issue");
    }
  }
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("myOrders")}</p><h1 className="page-title">{t("myOrders")}</h1>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {reportError && <p className="form-error" role="alert">{reportError}</p>}
    {error && !loading && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>{t("loading")}</p> : error ? <div className="form-card"><p className="form-error">{error}</p><Link className="button-primary" href="/account">{t("signIn")}</Link></div> : orders.length ? <div className="dashboard-card"><table className="data-table"><thead><tr><th>{t("order")}</th><th>{t("products")} / delivery status</th><th>{t("date")}</th><th>{t("total")}</th><th>{t("status")}</th><th>Delivery help</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td>#{order._id.slice(-8).toUpperCase()}</td><td><div className="customer-order-items">{order.items.map((item, index) => <div key={`${item.productId ?? item.title}:${item.variantId ?? index}`}><strong>{item.title}{item.variantLabel ? ` (${item.variantLabel})` : ""}</strong><span>× {item.quantity.toLocaleString("en-BD")} {unitLabel(item.unit, locale)} · ৳{item.unitPrice.toLocaleString("en-BD")} each{item.originalPrice && item.originalPrice>item.unitPrice ? ` (was ৳${item.originalPrice.toLocaleString("en-BD")}${item.discountPercent ? `, ${item.discountPercent}% off` : ""})` : ""}</span><span className="status-pill">{item.status}</span></div>)}</div></td><td>{new Date(order.createdAt).toLocaleDateString()}</td><td>৳{order.total.toLocaleString("en-BD")}<br/><small className="subtle">Products: ৳{Number(order.subtotal ?? order.items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0)).toLocaleString("en-BD")} · Delivery: ৳{Number(order.deliveryCharge ?? 0).toLocaleString("en-BD")}</small></td><td><span className="status-pill">{order.status}</span>{order.delivery?.deliveredAt && <span className="delivery-meta">Latest delivery update {new Date(order.delivery.deliveredAt).toLocaleString()}</span>}{order.delivery?.verificationStatus && order.delivery.verificationStatus !== "not_required" && <span className="delivery-meta">Verification: {order.delivery.verificationStatus}</span>}{order.delivery?.notifications?.map((notification) => <span className="delivery-meta" key={notification.createdAt}>{notification.message}</span>)}{order.delivery?.notifications?.some((notification) => !notification.readAt) && <button className="inline-button" onClick={() => void markNotificationsRead(order._id)}>Mark notifications read</button>}</td><td>{order.items.some((item) => ["shipped", "delivered", "failed"].includes(item.status)) && <button className="inline-button" onClick={() => void reportDelivery(order._id)}>Report a delivery issue</button>}{order.delivery?.reports?.filter((report) => report.status === "open").map((report) => <span className="delivery-meta" key={report.createdAt}>Report under review: {report.reason}</span>)}</td></tr>)}</tbody></table></div> : <div className="form-card"><p>{t("noOrders")}</p><Link className="button-primary" href="/products">{t("startShopping")}</Link></div>}
  </div>;
}
