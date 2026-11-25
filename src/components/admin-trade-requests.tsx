"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TradeItem = { title: string; quantity: number; unit?: string; requestedVariant?: string };
type Msg = { _id?: string; senderId: string; senderRole: string; senderName: string; body: string; createdAt: string };
type Req = { _id: string; requesterRole: "reseller" | "wholesaler"; requesterName: string; requesterEmail: string; contactNumber: string; deliveryLocation: string; customerMessage: string; items: TradeItem[]; status: string; messages: Msg[]; proposedDeliveryCharge?: number; proposedTotal?: number; negotiationNote?: string; adminUnread?: boolean; requesterUnread?: boolean; createdAt?: string };

const STATUSES = ["new_request","discussion","price_negotiation","approved","rejected","order_confirmed","completed"] as const;
const LABELS: Record<string, string> = { new_request: "New Request", discussion: "Discussion", price_negotiation: "Price Negotiation", approved: "Approved", rejected: "Rejected", order_confirmed: "Order Confirmed", completed: "Completed" };

export function AdminTradeRequests({ roleFilter }: { roleFilter?: "reseller" | "wholesaler" } = {}) {
  const [items, setItems] = useState<Req[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ status: "new_request", negotiationNote: "", proposedDeliveryCharge: "", proposedTotal: "" });

  const load = useCallback(async (select?: string) => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/trade-requests", { cache: "no-store" });
      const j = await res.json() as { items?: Req[]; error?: string };
      if (!res.ok) throw new Error(j.error || "Could not load requests");
      const list = (j.items ?? []).filter((x) => !roleFilter || x.requesterRole === roleFilter);
      setItems(list);
      setSelectedId((prev) => {
        const next = select ?? prev;
        if (next && list.some((x) => x._id === next)) return next;
        return list[0]?._id ?? "";
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }, [roleFilter]);

  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  const selected = useMemo(() => items.find((i) => i._id === selectedId) ?? null, [items, selectedId]);
  const formKey = selected?._id ?? "none";

  async function markRead(id: string) {
    await fetch(`/api/trade-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read" }) }).catch(() => {});
    await load(id);
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/trade-requests/${selected._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", body: reply.trim() }) });
      const j = await res.json() as { error?: string };
      if (!res.ok) throw new Error(j.error || "রিপ্লাই পাঠানো যায়নি");
      setReply(""); setNotice("রিপ্লাই পাঠানো হয়েছে।");
      await load(selected._id);
    } catch (e) { setError(e instanceof Error ? e.message : "রিপ্লাই পাঠানো যায়নি"); }
    finally { setBusy(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = { action: "admin_update", status: form.status, negotiationNote: form.negotiationNote };
      if (form.proposedDeliveryCharge !== "") body.proposedDeliveryCharge = Number(form.proposedDeliveryCharge);
      if (form.proposedTotal !== "") body.proposedTotal = Number(form.proposedTotal);
      if (reply.trim()) body.body = reply.trim();
      const res = await fetch(`/api/trade-requests/${selected._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json() as { error?: string };
      if (!res.ok) throw new Error(j.error || "আপডেট করা যায়নি");
      if (reply.trim()) setReply("");
      setNotice("অনুরোধ আপডেট/সংরক্ষণ করা হয়েছে।");
      await load(selected._id);
    } catch (e) { setError(e instanceof Error ? e.message : "আপডেট করা যায়নি"); }
    finally { setBusy(false); }
  }

  const panelTitle = roleFilter === "reseller" ? "Reseller Orders (রিসেলার অর্ডার অনুরোধ)" : roleFilter === "wholesaler" ? "Wholesaler Orders (হোলসেলার অর্ডার অনুরোধ)" : "Wholesale & Reseller Orders (অর্ডার অনুরোধ)";
  const panelDesc = roleFilter === "reseller"
    ? "শুধুমাত্র রিসেলারদের অনুরোধ দেখুন, মেসেজে আলোচনা করুন, দাম/ডেলিভারি চার্জ নির্ধারণ করুন এবং স্ট্যাটাস আপডেট করুন। রিসেলাররা ওয়েবসাইট থেকে সরাসরি অর্ডার করতে পারে না; তারা এখান থেকে মেসেজ/অনুরোধ পাঠায়।"
    : roleFilter === "wholesaler"
    ? "শুধুমাত্র হোলসেলারদের অনুরোধ দেখুন, মেসেজে আলোচনা করুন, দাম/ডেলিভারি চার্জ নির্ধারণ করুন এবং স্ট্যাটাস আপডেট করুন। হোলসেলাররা ওয়েবসাইট থেকে সরাসরি অর্ডার করতে পারে না; তারা এখান থেকে মেসেজ/অনুরোধ পাঠায়।"
    : "নতুন রিসেলার/হোলসেলার অনুরোধ দেখুন, মেসেজে আলোচনা করুন, দাম/ডেলিভারি চার্জ নির্ধারণ করুন এবং স্ট্যাটাস আপডেট করুন।";
  const emptyText = roleFilter === "reseller" ? "কোনো Reseller অর্ডার অনুরোধ নেই।" : roleFilter === "wholesaler" ? "কোনো Wholesaler অর্ডার অনুরোধ নেই।" : "কোনো Wholesale/Reseller অনুরোধ নেই।";

  return <div className="stack" style={{ display: "grid", gap: 12 }}>
    <div className="dashboard-card"><h3>{panelTitle}</h3><p className="subtle">{panelDesc}</p>{error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}</div>
    {loading ? <p className="subtle">লোড হচ্ছে…</p> : items.length === 0 ? <p className="subtle">{emptyText}</p> : <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(260px,360px) 1fr" }}>
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        {items.map((it) => <button type="button" key={it._id} className={`card ${selectedId === it._id ? "selected" : ""}`} style={{ padding: 10, textAlign: "left" }} onClick={() => { setSelectedId(it._id); setForm({ status: it.status, negotiationNote: it.negotiationNote ?? "", proposedDeliveryCharge: it.proposedDeliveryCharge != null ? String(it.proposedDeliveryCharge) : "", proposedTotal: it.proposedTotal != null ? String(it.proposedTotal) : "" }); if (it.adminUnread) void markRead(it._id); }}>
          <div><span className="status-pill">{it.requesterRole}</span> <strong>{LABELS[it.status] ?? it.status}</strong> {it.adminUnread ? <span className="status-pill">Unread</span> : null}</div>
          <div><strong>{it.requesterName}</strong> · {it.contactNumber}</div>
          <div className="subtle" style={{ fontSize: 12 }}>{it.items.map((x) => `${x.title} x${x.quantity}`).join(", ").slice(0, 70)}</div>
          <div className="subtle" style={{ fontSize: 12 }}>{it.createdAt ? new Date(it.createdAt).toLocaleString() : ""}</div>
        </button>)}
      </div>
      <div key={formKey}>
        {!selected ? <p className="subtle">একটি অনুরোধ নির্বাচন করুন।</p> : <div className="dashboard-card stack" style={{ display: "grid", gap: 10 }}>
          <div><strong>ক্রেতা:</strong> {selected.requesterName} ({selected.requesterRole}) · {selected.requesterEmail} · {selected.contactNumber}</div>
          <div><strong>ডেলিভারি লোকেশন:</strong> {selected.deliveryLocation}</div>
          <div><strong>চাহিদা/পণ্য:</strong><ul style={{ margin: "6px 0 0 18px" }}>{selected.items.map((it, i) => <li key={i}>{it.title} — পরিমাণ: {it.quantity} {it.unit || ""} {it.requestedVariant ? `(Variant: ${it.requestedVariant})` : ""}</li>)}</ul></div>
          {selected.customerMessage && <div><strong>ক্রেতার বার্তা:</strong><p style={{ margin: "4px 0 0" }}>{selected.customerMessage}</p></div>}

          <div className="card" style={{ padding: 10, display: "grid", gap: 8 }}>
            <strong>স্ট্যাটাস ও মূল্য আলোচনা (Negotiation)</strong>
            <label className="field">স্ট্যাটাস<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}</select></label>
            <label className="field">ডেলিভারি চার্জ (৳)<input type="number" min={0} step="0.01" value={form.proposedDeliveryCharge} onChange={(e) => setForm({ ...form, proposedDeliveryCharge: e.target.value })} /></label>
            <label className="field">প্রস্তাবিত/মোট মূল্য (৳)<input type="number" min={0} step="0.01" value={form.proposedTotal} onChange={(e) => setForm({ ...form, proposedTotal: e.target.value })} /></label>
            <label className="field">আলোচনা/নোট (Negotiation note)<textarea rows={3} value={form.negotiationNote} onChange={(e) => setForm({ ...form, negotiationNote: e.target.value })} maxLength={2000} /></label>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => void saveUpdate()}>স্ট্যাটাস/প্রস্তাব সংরক্ষণ করুন</button>
          </div>

          <div><strong>কথোপকথনের ইতিহাস (Conversation)</strong>
            <div style={{ display: "grid", gap: 8, maxHeight: 300, overflow: "auto", padding: 8, border: "1px solid var(--line,#eaeaea)", borderRadius: 8, marginTop: 6 }}>
              {selected.messages.length === 0 ? <p className="subtle">কোনো মেসেজ নেই।</p> : selected.messages.map((m, i) => <div key={m._id ?? i} style={{ padding: 8, borderRadius: 8, background: m.senderRole === "admin" || m.senderRole === "super_admin" ? "var(--soft-bg,#f8f7f2)" : "#fff", border: "1px solid var(--line,#eaeaea)" }}><div style={{ fontSize: 12 }}><strong>{m.senderName}</strong> ({m.senderRole}) · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</div><div>{m.body}</div></div>)}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="ক্রেতাকে রিপ্লাই লিখুন…" maxLength={4000} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="button-primary" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>রিপ্লাই পাঠান</button><button type="button" className="button-secondary" onClick={() => void markRead(selected._id)}>পড়া হয়েছে</button></div>
          </div>
        </div>}
      </div>
    </div>}
  </div>;
}
