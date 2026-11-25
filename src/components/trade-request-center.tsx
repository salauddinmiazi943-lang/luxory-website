"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ProductLite = { _id: string; title: { en: string; bn?: string }; slug?: string; unit?: string; images?: string[]; variants?: { _id?: string; label: string }[] };
type TradeItem = { productId?: string; title: string; quantity: number; unit: string; variantLabel?: string; requestedVariant?: string; image?: string };
type Msg = { _id?: string; senderId: string; senderRole: string; senderName: string; body: string; createdAt: string; readByAdmin?: boolean; readByRequester?: boolean };
type Req = { _id: string; requesterRole: "reseller" | "wholesaler"; requesterName: string; requesterEmail: string; contactNumber: string; deliveryLocation: string; customerMessage: string; items: TradeItem[]; status: string; messages: Msg[]; proposedItems?: { title: string; quantity?: number; unitPrice?: number; note?: string }[]; proposedDeliveryCharge?: number; proposedTotal?: number; negotiationNote?: string; adminUnread?: boolean; requesterUnread?: boolean; createdAt?: string };

const STATUS_LABELS: Record<string, string> = { new_request: "New Request", discussion: "Discussion", price_negotiation: "Price Negotiation", approved: "Approved", rejected: "Rejected", order_confirmed: "Order Confirmed", completed: "Completed" };

export function TradeRequestCenter({ role }: { role: "reseller" | "wholesaler" }) {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [items, setItems] = useState<Req[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ contactNumber: "", deliveryLocation: "", customerMessage: "" });
  const [lines, setLines] = useState<TradeItem[]>([{ title: "", quantity: 1, unit: "piece", requestedVariant: "" }]);
  const [reply, setReply] = useState("");

  const load = useCallback(async (select?: string) => {
    setLoading(true); setError("");
    try {
      const [r, p] = await Promise.all([fetch("/api/trade-requests", { cache: "no-store" }), fetch("/api/products?limit=100", { cache: "no-store" })]);
      const rj = await r.json() as { items?: Req[]; error?: string };
      const pj = await p.json() as { items?: ProductLite[] };
      if (!r.ok) throw new Error(rj.error || "Could not load requests");
      const list = rj.items ?? [];
      setItems(list);
      setProducts(pj.items ?? []);
      setSelectedId((prev) => {
        const next = select ?? prev;
        if (next && list.some((x) => x._id === next)) return next;
        return list[0]?._id ?? "";
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  const selected = useMemo(() => items.find((i) => i._id === selectedId) ?? null, [items, selectedId]);

  function setLine(i: number, patch: Partial<TradeItem>) { setLines((all) => all.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }
  function pickProduct(i: number, pid: string) {
    const p = products.find((x) => x._id === pid);
    if (!p) { setLine(i, { productId: "", title: "", image: "", unit: "piece" }); return; }
    setLine(i, { productId: p._id, title: p.title.en, image: p.images?.[0] ?? "", unit: p.unit ?? "piece" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const clean = lines.map((l) => ({ ...l, title: l.title.trim(), quantity: Number(l.quantity), requestedVariant: (l.requestedVariant ?? "").trim() })).filter((l) => l.title && l.quantity > 0);
      if (!clean.length) throw new Error("কমপক্ষে একটি পণ্য ও পরিমাণ দিন।");
      if (form.contactNumber.trim().length < 6) throw new Error("সঠিক যোগাযোগ নম্বর দিন।");
      if (form.deliveryLocation.trim().length < 3) throw new Error("ডেলিভারি লোকেশন/ঠিকানা দিন।");
      const res = await fetch("/api/trade-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: clean, contactNumber: form.contactNumber, deliveryLocation: form.deliveryLocation, customerMessage: form.customerMessage }) });
      const j = await res.json() as { item?: Req; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error || "অনুরোধ পাঠানো যায়নি");
      setNotice("অর্ডার অনুরোধ (Order Request) পাঠানো হয়েছে। অ্যাডমিন এখানে মেসেজে উত্তর দেবেন।");
      setLines([{ title: "", quantity: 1, unit: "piece", requestedVariant: "" }]);
      setForm({ contactNumber: "", deliveryLocation: "", customerMessage: "" });
      await load(j.item._id);
    } catch (e) { setError(e instanceof Error ? e.message : "অনুরোধ পাঠানো যায়নি"); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    if (!selected || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/trade-requests/${selected._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", body: reply.trim() }) });
      const j = await res.json() as { item?: Req; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error || "মেসেজ পাঠানো যায়নি");
      setReply("");
      await load(selected._id);
    } catch (e) { setError(e instanceof Error ? e.message : "মেসেজ পাঠানো যায়নি"); }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    await fetch(`/api/trade-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read" }) }).catch(() => {});
    await load(id);
  }

  return <div className="stack" style={{ display: "grid", gap: 16 }}>
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>{role === "wholesaler" ? "হোলসেলার: অ্যাডমিনকে মেসেজ/অর্ডার অনুরোধ পাঠান" : "রিসেলার: অ্যাডমিনকে মেসেজ/অর্ডার অনুরোধ পাঠান"}</h2>
      <p className="subtle">{role === "wholesaler" ? "Wholesale (হোলসেল)" : "Reseller (রিসেলার)"} ক্রেতা হিসেবে আপনি ওয়েবসাইট থেকে সাধারণ Checkout করতে পারবেন না। আপনার প্রয়োজনীয় পণ্যের তালিকা, পরিমাণ ও বার্তা নিচে লিখে <strong>অ্যাডমিনের কাছে পাঠান</strong> — অ্যাডমিন এখানে মেসেজে উত্তর দেবেন এবং দাম/ডেলিভারি নিয়ে আলোচনা করে অর্ডার নিশ্চিত করবেন।</p>
      {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
      <form className="stack" onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <div className="stack" style={{ display: "grid", gap: 8 }}>
          <strong>পণ্য নির্বাচন (একাধিক যোগ করতে পারেন)</strong>
          {lines.map((line, i) => <div key={i} className="card" style={{ padding: 10, display: "grid", gap: 8 }}>
            <select value={line.productId ?? ""} onChange={(e) => pickProduct(i, e.target.value)}>
              <option value="">পণ্য বাছুন (ঐচ্ছিক) বা নিচে নাম লিখুন</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.title.en}</option>)}
            </select>
            <input placeholder="পণ্যের নাম (Product Name)" value={line.title} onChange={(e) => setLine(i, { title: e.target.value })} required maxLength={300} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input type="number" min={0.01} step="0.01" value={line.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} placeholder="পরিমাণ (Quantity)" required />
              <input placeholder="ইউনিট/ভেরিয়েন্ট (Variant)" value={line.requestedVariant ?? ""} onChange={(e) => setLine(i, { requestedVariant: e.target.value })} maxLength={300} />
            </div>
            {lines.length > 1 && <button type="button" className="inline-button" onClick={() => setLines((all) => all.filter((_, idx) => idx !== i))}>মুছুন</button>}
          </div>)}
          <button type="button" className="button-secondary" onClick={() => setLines((all) => [...all, { title: "", quantity: 1, unit: "piece", requestedVariant: "" }])}>+ আরেকটি পণ্য যোগ করুন</button>
        </div>
        <div className="field"><label htmlFor="trade-contact-number">যোগাযোগ নম্বর (Contact Number)</label><input id="trade-contact-number" name="contactNumber" type="tel" inputMode="tel" autoComplete="tel" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} required minLength={6} maxLength={40} /></div>
        <div className="field"><label>ডেলিভারি লোকেশন (Delivery Location)</label><textarea value={form.deliveryLocation} onChange={(e) => setForm({ ...form, deliveryLocation: e.target.value })} required minLength={3} maxLength={1000} rows={2} /></div>
        <div className="field"><label>আপনার বার্তা/বিশেষ চাহিদা (Message)</label><textarea value={form.customerMessage} onChange={(e) => setForm({ ...form, customerMessage: e.target.value })} maxLength={4000} rows={3} /></div>
        <button className="button-primary" disabled={busy}>{busy ? "পাঠানো হচ্ছে…" : "অনুরোধ জমা দিন (Submit Request)"}</button>
      </form>
    </section>

    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>আমার অনুরোধ ও মেসেজ (My Requests)</h2>
      {loading ? <p className="subtle">লোড হচ্ছে…</p> : items.length === 0 ? <p className="subtle">এখনো কোনো অনুরোধ নেই।</p> : <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(220px,320px) 1fr" }}>
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((it) => <button type="button" key={it._id} className={`card ${selectedId === it._id ? "selected" : ""}`} style={{ padding: 10, textAlign: "left" }} onClick={() => { setSelectedId(it._id); if (it.requesterUnread) void markRead(it._id); }}>
            <div><strong>{STATUS_LABELS[it.status] ?? it.status}</strong> {it.requesterUnread ? <span className="status-pill">নতুন মেসেজ</span> : null}</div>
            <div className="subtle" style={{ fontSize: 12 }}>{it.items.map((x) => x.title).join(", ").slice(0, 60)}</div>
            <div className="subtle" style={{ fontSize: 12 }}>{it.createdAt ? new Date(it.createdAt).toLocaleString() : ""}</div>
          </button>)}
        </div>
        <div>
          {!selected ? <p className="subtle">একটি অনুরোধ নির্বাচন করুন।</p> : <div className="stack" style={{ display: "grid", gap: 10 }}>
            <div><strong>স্ট্যাটাস:</strong> {STATUS_LABELS[selected.status] ?? selected.status}</div>
            <div><strong>যোগাযোগ:</strong> {selected.contactNumber}<br /><strong>ডেলিভারি লোকেশন:</strong> {selected.deliveryLocation}</div>
            <div><strong>পণ্য তালিকা:</strong><ul>{selected.items.map((it, i) => <li key={i}>{it.title} — Qty: {it.quantity} {it.unit || ""} {it.requestedVariant ? `(${it.requestedVariant})` : ""}</li>)}</ul></div>
            {selected.customerMessage && <div><strong>আপনার বার্তা:</strong><p>{selected.customerMessage}</p></div>}
            {(selected.proposedDeliveryCharge != null || selected.proposedTotal != null || selected.negotiationNote) && <div className="card" style={{ padding: 10 }}><strong>অ্যাডমিনের প্রস্তাব (Negotiation)</strong>{selected.negotiationNote ? <p>{selected.negotiationNote}</p> : null}{selected.proposedDeliveryCharge != null ? <p>ডেলিভারি চার্জ: ৳{Number(selected.proposedDeliveryCharge).toLocaleString("en-BD")}</p> : null}{selected.proposedTotal != null ? <p>মোট/প্রস্তাবিত মূল্য: ৳{Number(selected.proposedTotal).toLocaleString("en-BD")}</p> : null}</div>}
            <div><strong>কথোপকথন (Conversation)</strong>
              <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto", padding: 8, border: "1px solid var(--line,#eaeaea)", borderRadius: 8 }}>
                {selected.messages.length === 0 ? <p className="subtle">এখনো কোনো মেসেজ নেই।</p> : selected.messages.map((m, i) => <div key={m._id ?? i} style={{ padding: 8, borderRadius: 8, background: m.senderRole === "admin" || m.senderRole === "super_admin" ? "var(--soft-bg,#f8f7f2)" : "#fff", border: "1px solid var(--line,#eaeaea)" }}><div style={{ fontSize: 12 }}><strong>{m.senderName}</strong> ({m.senderRole}) · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</div><div>{m.body}</div></div>)}
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="অ্যাডমিনকে মেসেজ লিখুন…" maxLength={4000} />
              <div style={{ display: "flex", gap: 8 }}><button type="button" className="button-primary" disabled={busy || !reply.trim()} onClick={() => void sendMessage()}>মেসেজ পাঠান</button><button type="button" className="button-secondary" onClick={() => void markRead(selected._id)}>পড়া হয়েছে চিহ্নিত করুন</button></div>
            </div>
          </div>}
        </div>
      </div>}
    </section>
  </div>;
}
