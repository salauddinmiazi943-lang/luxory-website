"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DeliveryOrder = {
  _id: string;
  status: string;
  total: number;
  paymentMethod: string;
  customerInfo: { name: string; phone: string; address: string; division?: string; district?: string; upazila?: string; union?: string; area?: string };
  items: { title: string; variantLabel?: string; unit: string; quantity: number; unitPrice: number; status: string }[];
};
type Counts = { assigned: number; pending: number; completed: number; failed: number };
type Profile = { employeeId: string; name: string; email: string; phone: string; address: string };

const emptyCounts: Counts = { assigned: 0, pending: 0, completed: 0, failed: 0 };

export function DeliveryStaffDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState(emptyCounts);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/delivery/orders");
    const data = await response.json() as { counts?: Counts; items?: DeliveryOrder[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load assigned orders");
    setCounts(data.counts ?? emptyCounts);
    setOrders(data.items ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [sessionResponse, profileResponse] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/delivery/profile"),
        ]);
        if (sessionResponse.status === 401 || profileResponse.status === 401) {
          router.replace("/account");
          return;
        }
        const [session, profileResult] = await Promise.all([
          sessionResponse.json() as Promise<{ user?: { role: string }; error?: string }>,
          profileResponse.json() as Promise<{ profile?: Profile; error?: string }>,
        ]);
        if (!sessionResponse.ok) throw new Error(session.error || "Could not verify access");
        if (session.user?.role !== "delivery_staff") {
          router.replace("/account");
          return;
        }
        if (!profileResponse.ok || !profileResult.profile) throw new Error(profileResult.error || "Could not load your profile");
        if (!active) return;
        setProfile(profileResult.profile);
        await loadOrders();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load delivery dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [loadOrders, router]);

  async function updateDelivery(order: DeliveryOrder, action: "delivered" | "failed") {
    setError("");
    setNotice("");
    const reason = action === "failed" ? window.prompt("Required reason for failed delivery") : null;
    if (action === "failed" && !reason?.trim()) return;
    const response = await fetch(`/api/orders/${order._id}/delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "failed"
        ? { action, reason: reason?.trim() }
        : { action, notes: "", notifyCustomer: false }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error || "Could not update delivery status");
      return;
    }
    setNotice(`Order #${order._id.slice(-8).toUpperCase()} updated.`);
    try {
      await loadOrders();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh assigned orders");
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError("");
    setNotice("");
    setSavingProfile(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/delivery/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), address: form.get("address") }),
      });
      const result = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error || "Could not update profile");
      setProfile(result.profile);
      setNotice("Profile updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      setError("Could not sign out. Please try again.");
      return;
    }
    window.dispatchEvent(new Event("eshop:auth-changed"));
    router.replace("/account");
  }

  if (loading) return <div className="page-shell"><p className="subtle">Loading delivery dashboard…</p></div>;

  return <div className="page-shell delivery-dashboard">
    <header className="delivery-dashboard-heading">
      <div><p className="eyebrow">LUXORA DELIVERY</p><h1>My delivery dashboard</h1><p>{profile?.name} · Employee ID {profile?.employeeId}</p></div>
      <button className="button-secondary" onClick={signOut}>Sign out</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <section className="delivery-stat-grid" aria-label="Delivery summary">
      {[
        ["Total assigned orders", counts.assigned],
        ["Pending orders", counts.pending],
        ["Completed orders", counts.completed],
        ["Failed orders", counts.failed],
      ].map(([label, count]) => <article className="delivery-stat-card" key={label}>
        <span>{label}</span><strong>{count}</strong>
      </article>)}
    </section>
    <section className="delivery-orders-section">
      <h2>Assigned orders</h2>
      {orders.length === 0 ? <p className="subtle">No orders are currently assigned to you.</p> : <div className="delivery-order-list">{orders.map((order) => <article className="delivery-order-card" key={order._id}>
        <header><div><p className="eyebrow">ORDER #{order._id.slice(-8).toUpperCase()}</p><span className="status-pill">{order.status}</span></div><strong>COD ৳{order.total.toLocaleString("en-BD")}</strong></header>
        <div className="delivery-customer-details">
          <strong>{order.customerInfo.name}</strong>
          <a href={`tel:${order.customerInfo.phone}`}>{order.customerInfo.phone}</a>
          <address>{[order.customerInfo.address, order.customerInfo.area, order.customerInfo.union, order.customerInfo.upazila, order.customerInfo.district, order.customerInfo.division].filter(Boolean).join(", ")}</address>
        </div>
        <div className="delivery-order-items"><strong>Order details</strong>{order.items.map((item, index) => <p key={`${item.title}-${index}`}>
          {item.title}{item.variantLabel ? ` (${item.variantLabel})` : ""} × {item.quantity} {item.unit} · ৳{item.unitPrice.toLocaleString("en-BD")} each
        </p>)}</div>
        {(order.status === "shipped" || order.status === "failed") && <div className="delivery-order-actions">
          <button className="button-primary" onClick={() => void updateDelivery(order, "delivered")}>Mark delivered</button>
          {order.status === "shipped" && <button className="button-secondary" onClick={() => void updateDelivery(order, "failed")}>Mark failed</button>}
        </div>}
      </article>)}</div>}
    </section>
    {profile && <section className="delivery-profile-section">
      <h2>My profile</h2>
      <form className="delivery-profile-form" onSubmit={saveProfile}>
        <div className="field"><label htmlFor="delivery-profile-employee-id">Employee ID</label><input id="delivery-profile-employee-id" value={profile.employeeId} readOnly /></div>
        <div className="field"><label htmlFor="delivery-profile-email">Login email</label><input id="delivery-profile-email" value={profile.email} readOnly /></div>
        <div className="field"><label htmlFor="delivery-profile-name">Name</label><input id="delivery-profile-name" name="name" defaultValue={profile.name} required minLength={2} maxLength={120} /></div>
        <div className="field"><label htmlFor="delivery-profile-phone">Phone</label><input id="delivery-profile-phone" name="phone" type="tel" defaultValue={profile.phone} required minLength={6} maxLength={30} /></div>
        <div className="field delivery-profile-address"><label htmlFor="delivery-profile-address">Address</label><textarea id="delivery-profile-address" name="address" defaultValue={profile.address} required minLength={5} maxLength={1000} /></div>
        <button className="button-primary" disabled={savingProfile}>{savingProfile ? "Saving…" : "Update profile"}</button>
      </form>
    </section>}
  </div>;
}
