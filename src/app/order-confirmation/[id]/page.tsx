import Link from "next/link";

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="page-shell"><div className="form-card"><p className="eyebrow">ORDER RECEIVED</p><h1 className="page-title" style={{ fontSize: 30 }}>Thank you for your order.</h1><p>Your COD order <strong>#{id.slice(-8).toUpperCase()}</strong> has been placed. We’ll confirm your delivery details shortly.</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link href="/products" className="button-primary">Continue shopping</Link><Link href="/orders" className="button-secondary">My orders</Link></div></div></div>;
}
