"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { GuestDeliveryReport } from "@/components/guest-delivery-report";
import { unitLabel } from "@/lib/product-units";
import { useStore } from "@/components/store-context";

type OrderItem = { title: string; variantLabel?: string; unit?: string; quantity: number; originalPrice?: number; unitPrice: number; discountPercent?: number; lineTotal?: number; status?: string };
type Order = { _id: string; subtotal?: number; deliveryCharge?: number; total: number; status?: string; paymentMethod?: string; createdAt?: string; items: OrderItem[] };

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const { locale } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    if (typeof window === "undefined" || !id) return "";
    const key = window.sessionStorage.getItem(`delivery-access:${id}`) ?? "";
    return key ? `?accessKey=${encodeURIComponent(key)}` : "";
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/orders/${id}${query}`).then(async (response) => {
      const result = await response.json() as { item?: Order; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Could not load order details");
      if (active) setOrder(result.item);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load order details"); });
    return () => { active = false; };
  }, [id, query]);

  return <div className="page-shell">
    <div className="form-card">
      <p className="eyebrow">ORDER RECEIVED</p>
      <h1 className="page-title" style={{ fontSize: 30 }}>Thank you for your order.</h1>
      <p>Your COD order <strong>#{id.slice(-8).toUpperCase()}</strong> has been placed. We’ll confirm your delivery details shortly.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {order && <div className="dashboard-card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Order details</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead>
            <tbody>{order.items.map((item, index) => <tr key={`${item.title}:${index}`}>
              <td>{item.title}{item.variantLabel ? ` (${item.variantLabel})` : ""}</td>
              <td>{item.quantity.toLocaleString("en-BD")} {unitLabel(item.unit, locale)}</td>
              <td>{item.originalPrice && item.originalPrice>item.unitPrice && <del className="subtle" style={{marginRight:6}}>৳{Number(item.originalPrice).toLocaleString("en-BD")}</del>}৳{Number(item.unitPrice ?? 0).toLocaleString("en-BD")} / {unitLabel(item.unit, locale)}{item.discountPercent ? <small className="subtle"> · {item.discountPercent}% off</small> : null}</td>
              <td>৳{Number(item.lineTotal ?? (Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0))).toLocaleString("en-BD")}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ textAlign: "right", marginTop: 12 }}><p style={{margin:0}}>Product total: ৳{Number(order.subtotal ?? order.items.reduce((s,i)=>s+(i.lineTotal ?? i.unitPrice*i.quantity),0)).toLocaleString("en-BD")}</p><p style={{margin:0}}>Delivery charge: ৳{Number(order.deliveryCharge ?? 0).toLocaleString("en-BD")}</p><p style={{margin:0}}><strong>Final payable: ৳{Number(order.total ?? 0).toLocaleString("en-BD")}</strong></p></div>
      </div>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}><Link href="/products" className="button-primary">Continue shopping</Link><Link href="/orders" className="button-secondary">My orders</Link></div>
    </div>
    <GuestDeliveryReport orderId={id} />
  </div>;
}
