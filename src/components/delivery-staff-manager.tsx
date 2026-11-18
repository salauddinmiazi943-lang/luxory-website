"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Staff = {
  _id: string;
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  status: string;
  createdAt?: string;
};

type OrderItem = {
  _id: string;
  status: string;
  total?: number;
  paymentMethod?: string;
  createdAt?: string;
  customerInfo?: { name?: string; phone?: string };
  delivery?: {
    assignment?: { assignedTo?: string; assignedAt?: string };
    assignmentHistory?: { assignedTo: string; assignedBy: string; assignedAt: string; action: string; previousStaffId?: string }[];
    deliveredAt?: string; failedAt?: string; failedReason?: string;
    handovers?: { assignedTo: string; codDue?: number; codCollected?: number; codSettled?: number; verifiedDeliveredQuantity?: number; deliveredQuantity?: number; returnedQuantity?: number; missingQuantity?: number; disputedQuantity?: number; acceptedQuantity?: number }[];
    reports?: { status?: string; reason?: string; details?: string; createdAt?: string; resolvedBy?: string }[];
  };
};

type Props = {
  staff: Staff[];
  reload: () => void;
  setNotice: (m: string) => void;
  setError: (m: string) => void;
};

type FormState = { employeeId: string; name: string; email: string; phone: string; address: string; password: string };

const emptyForm: FormState = { employeeId: "", name: "", email: "", phone: "", address: "", password: "" };

function safeJson(text: string) {
  try { return text ? JSON.parse(text) : {}; } catch { return { error: "Server returned an invalid response." }; }
}

export function DeliveryStaffManager({ staff, reload, setNotice, setError }: Props) {
  const [orders, setOrders] = useState<OrderItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/orders");
        const json = safeJson(await res.text());
        if (active && res.ok && Array.isArray(json.items)) setOrders(json.items as OrderItem[]);
      } catch { /* performance/history will show partial/zero if unavailable */ }
    })();
    return () => { active = false; };
  }, [staff]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "employeeId" | "createdAt" | "deliveries">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(10);
  const [pageState, setPageState] = useState({ page: 1, key: "||all|10" });
  const filterKey = `${query}|${statusFilter}|${pageSize}`;
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (updater: number | ((p: number) => number)) => setPageState((prev) => {
    const base = prev.key === filterKey ? prev.page : 1;
    const next = typeof updater === "function" ? updater(base) : updater;
    return { page: next, key: filterKey };
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState({ employeeId: "", name: "", email: "", phone: "", address: "", password: "" });
  const [viewItem, setViewItem] = useState<Staff | null>(null);
  const [historyItem, setHistoryItem] = useState<Staff | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);

  const statsByStaff = useMemo(() => {
    const map = new Map<string, { assigned: number; completed: number; failed: number; pending: number; reassigned: number; codCollected: number; codDeposited: number }>();
    for (const s of staff) map.set(s._id, { assigned: 0, completed: 0, failed: 0, pending: 0, reassigned: 0, codCollected: 0, codDeposited: 0 });
    for (const order of orders) {
      const assignedTo = order.delivery?.assignment?.assignedTo;
      if (assignedTo && map.has(assignedTo)) {
        const st = map.get(assignedTo)!;
        st.assigned += 1;
        if (order.status === "delivered") st.completed += 1;
        else if (order.status === "failed") st.failed += 1;
        else if (!["cancelled"].includes(order.status)) st.pending += 1;
      }
      const history = order.delivery?.assignmentHistory ?? [];
      const reassignedIds = new Set(history.filter((h) => h.action === "reassigned" && h.previousStaffId).map((h) => h.previousStaffId as string));
      for (const rid of reassignedIds) if (map.has(rid)) map.get(rid)!.reassigned += 1;
      for (const h of order.delivery?.handovers ?? []) {
        if (!map.has(h.assignedTo)) continue;
        const st = map.get(h.assignedTo)!;
        st.codCollected += Number(h.codCollected || 0);
        st.codDeposited += Number(h.codSettled || 0);
      }
    }
    return map;
  }, [staff, orders]);

  const overview = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((s) => s.status === "active").length;
    const inactive = staff.filter((s) => s.status === "inactive").length;
    const suspended = staff.filter((s) => s.status === "suspended").length;
    const pending = staff.filter((s) => s.status === "pending").length;
    let totalAssigned = 0, completed = 0, failed = 0;
    for (const s of staff) {
      const st = statsByStaff.get(s._id);
      if (st) { totalAssigned += st.assigned; completed += st.completed; failed += st.failed; }
    }
    return { total, active, inactive, suspended, pending, totalAssigned, completed, failed };
  }, [staff, statsByStaff]);

  const filtered = useMemo(() => {
    let list = [...staff];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((s) => [s.employeeId, s.name, s.email, s.phone, s.address].some((v) => String(v || "").toLowerCase().includes(q)));
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    list.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortBy === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortBy === "employeeId") { av = (a.employeeId || "").toLowerCase(); bv = (b.employeeId || "").toLowerCase(); }
      else if (sortBy === "createdAt") { av = new Date(a.createdAt || 0).getTime(); bv = new Date(b.createdAt || 0).getTime(); }
      else if (sortBy === "deliveries") { av = statsByStaff.get(a._id)?.completed || 0; bv = statsByStaff.get(b._id)?.completed || 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [staff, query, statusFilter, sortBy, sortDir, statsByStaff]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const submitCreate = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/delivery-staff/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = safeJson(await res.text());
      if (!res.ok) throw new Error(json.error || "Could not create account");
      setNotice("Delivery staff account created.");
      setForm(emptyForm);
      setShowForm(false);
      reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create account"); }
    finally { setBusy(false); }
  }, [form, reload, setError, setNotice]);

  const doPatch = useCallback(async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/delivery-staff/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = safeJson(await res.text());
      if (!res.ok) throw new Error(json.error || "Update failed");
      setNotice(okMsg);
      setEditItem(null); setConfirmAction(null);
      reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
    finally { setBusy(false); }
  }, [reload, setError, setNotice]);

  const openEdit = (item: Staff) => {
    setEditForm({ employeeId: item.employeeId || "", name: item.name, email: item.email, phone: item.phone || "", address: item.address || "", password: "" });
    setEditItem(item);
  };

  const submitEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const body: Record<string, unknown> = { employeeId: editForm.employeeId, name: editForm.name, email: editForm.email, phone: editForm.phone, address: editForm.address };
    if (editForm.password.trim()) body.password = editForm.password;
    void doPatch(editItem._id, body, "Profile updated.");
  };

  const ordersFor = (staffId: string) => orders.filter((o) => o.delivery?.assignment?.assignedTo === staffId || (o.delivery?.assignmentHistory ?? []).some((h) => h.assignedTo === staffId || h.previousStaffId === staffId));

  return (
    <div className="ds-shell">
      <div className="ds-overview">
        {[
          ["Total staff", overview.total], ["Active", overview.active], ["Inactive", overview.inactive], ["Suspended", overview.suspended],
          ["Pending", overview.pending], ["Assigned orders", overview.totalAssigned], ["Completed", overview.completed], ["Failed", overview.failed],
        ].map(([label, value]) => (
          <div key={String(label)} className="ds-card"><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>

      <div className="ds-toolbar">
        <div className="ds-toolbar-left">
          <input className="ds-input" placeholder="Search by ID, name, email, phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="ds-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option><option value="pending">Pending</option>
          </select>
          <select className="ds-input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="createdAt">Sort: Newest</option><option value="name">Sort: Name</option><option value="employeeId">Sort: Employee ID</option><option value="deliveries">Sort: Deliveries</option>
          </select>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>{sortDir === "asc" ? "↑ Asc" : "↓ Desc"}</button>
        </div>
        <button type="button" className="button-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Close form" : "+ New staff"}</button>
      </div>

      {showForm && (
        <form className="ds-form" onSubmit={submitCreate}>
          <h3>Register delivery staff</h3>
          <div className="ds-form-grid">
            <label className="field"><span>Employee ID</span><input required minLength={2} maxLength={32} pattern="[A-Za-z0-9-]+" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })} placeholder="e.g. DS-001" /></label>
            <label className="field"><span>Full name</span><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>Login email</span><input required type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field"><span>Phone</span><input required type="tel" inputMode="tel" autoComplete="tel" minLength={6} maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field ds-span-2"><span>Address</span><textarea required minLength={5} maxLength={1000} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label className="field"><span>Initial password (min 10)</span><input required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label className="field"><span>Account activation</span><select disabled value="active"><option value="active">Active on create</option></select><small className="subtle">Invitation/activation token flow is pending (DB backup/migration required). Current: admin sets initial password securely (bcrypt).</small></label>
          </div>
          <div className="ds-form-actions"><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving..." : "Create account"}</button></div>
        </form>
      )}

      <div className="ds-table-wrap">
        <table className="ds-table">
          <thead><tr><th>Employee ID</th><th>Staff</th><th>Phone / Email</th><th>Address</th><th>Deliveries</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {pageItems.length === 0 ? <tr><td colSpan={7} className="subtle" style={{ padding: 20, textAlign: "center" }}>No delivery staff found.</td></tr> : pageItems.map((item) => {
              const st = statsByStaff.get(item._id);
              return (
                <tr key={item._id}>
                  <td><strong>{item.employeeId || "-"}</strong></td>
                  <td>{item.name}</td>
                  <td>{item.phone || "-"}<br /><span className="subtle">{item.email}</span></td>
                  <td className="subtle">{item.address || "-"}</td>
                  <td>{st?.completed ?? 0} / {st?.assigned ?? 0}</td>
                  <td><span className={`ds-badge ds-${item.status}`}>{item.status}</span></td>
                  <td className="ds-actions">
                    <button type="button" className="ds-btn" onClick={() => setViewItem(item)}>View</button>
                    <button type="button" className="ds-btn" onClick={() => openEdit(item)}>Edit</button>
                    <button type="button" className="ds-btn" onClick={() => setHistoryItem(item)}>History</button>
                    {item.status !== "active" && <button type="button" className="ds-btn ds-btn-ok" onClick={() => setConfirmAction({ id: item._id, status: "active", label: "Activate" })}>Activate</button>}
                    {item.status === "active" && <button type="button" className="ds-btn" onClick={() => setConfirmAction({ id: item._id, status: "inactive", label: "Deactivate" })}>Deactivate</button>}
                    {item.status !== "suspended" && <button type="button" className="ds-btn ds-btn-danger" onClick={() => setConfirmAction({ id: item._id, status: "suspended", label: "Suspend" })}>Suspend</button>}
                    {item.status === "suspended" && <button type="button" className="ds-btn ds-btn-ok" onClick={() => setConfirmAction({ id: item._id, status: "active", label: "Reactivate" })}>Reactivate</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ds-pagination">
        <span className="subtle">{filtered.length} staff · page {safePage}/{totalPages}</span>
        <div className="ds-page-controls">
          <button type="button" className="ds-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <button type="button" className="ds-btn" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          <select className="ds-input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{[10, 20, 50].map((n) => <option key={n} value={n}>{n}/page</option>)}</select>
        </div>
      </div>

      {confirmAction && (
        <div className="ds-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ds-modal">
            <h3>{confirmAction.label} account?</h3>
            <p className="subtle">This will change the account status to <strong>{confirmAction.status}</strong>. No order history will be deleted.</p>
            <div className="ds-modal-actions">
              <button type="button" className="ds-btn" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void doPatch(confirmAction.id, { status: confirmAction.status }, `Account ${confirmAction.label.toLowerCase()}d.`)}>{busy ? "Saving..." : confirmAction.label}</button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="ds-modal-backdrop" role="dialog" aria-modal="true">
          <form className="ds-modal ds-modal-wide" onSubmit={submitEdit}>
            <h3>Edit profile — {editItem.name}</h3>
            <div className="ds-form-grid">
              <label className="field"><span>Employee ID</span><input required minLength={2} maxLength={32} pattern="[A-Za-z0-9-]+" value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value.toUpperCase() })} /></label>
              <label className="field"><span>Name</span><input required minLength={2} maxLength={120} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
              <label className="field"><span>Email</span><input required type="email" maxLength={254} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></label>
              <label className="field"><span>Phone</span><input required type="tel" inputMode="tel" autoComplete="tel" minLength={6} maxLength={30} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></label>
              <label className="field ds-span-2"><span>Address</span><textarea required minLength={5} maxLength={1000} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label>
              <label className="field ds-span-2"><span>Reset password (leave blank to keep current)</span><input type="password" minLength={10} maxLength={128} autoComplete="new-password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} /><small className="subtle">Password is hashed (bcrypt) on save. Delivery area change UI is pending (DB field not yet added).</small></label>
            </div>
            <div className="ds-modal-actions"><button type="button" className="ds-btn" onClick={() => setEditItem(null)}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></div>
          </form>
        </div>
      )}

      {viewItem && (() => {
        const st = statsByStaff.get(viewItem._id) || { assigned: 0, completed: 0, failed: 0, pending: 0, reassigned: 0, codCollected: 0, codDeposited: 0 };
        const successRate = st.assigned > 0 ? Math.round((st.completed / st.assigned) * 100) : 0;
        return (
          <div className="ds-modal-backdrop" role="dialog" aria-modal="true">
            <div className="ds-modal ds-modal-wide">
              <h3>Staff profile</h3>
              <div className="ds-profile-grid">
                <div><strong>Employee ID</strong><div>{viewItem.employeeId || "-"}</div></div>
                <div><strong>Name</strong><div>{viewItem.name}</div></div>
                <div><strong>Email</strong><div>{viewItem.email}</div></div>
                <div><strong>Phone</strong><div>{viewItem.phone || "-"}</div></div>
                <div className="ds-span-2"><strong>Address</strong><div>{viewItem.address || "-"}</div></div>
                <div><strong>Status</strong><div><span className={`ds-badge ds-${viewItem.status}`}>{viewItem.status}</span></div></div>
                <div><strong>Joined</strong><div>{viewItem.createdAt ? new Date(viewItem.createdAt).toLocaleDateString() : "-"}</div></div>
              </div>
              <h4 style={{ marginTop: 16 }}>Performance (from existing orders)</h4>
              <div className="ds-overview ds-overview-sm">
                {[["Assigned", st.assigned], ["Completed", st.completed], ["Failed", st.failed], ["Pending", st.pending], ["Reassigned (from)", st.reassigned], ["Success rate", `${successRate}%`], ["COD collected", `৳${st.codCollected.toLocaleString("en-BD")}`], ["COD deposited", `৳${st.codDeposited.toLocaleString("en-BD")}`]].map(([l, v]) => <div key={String(l)} className="ds-card"><span>{l}</span><strong>{v}</strong></div>)}
              </div>
              <p className="subtle">Complaints/date-wise COD reports/assigned delivery area: pending DB-backed fields or dedicated views (not fabricated).</p>
              <div className="ds-modal-actions"><button type="button" className="ds-btn" onClick={() => { setViewItem(null); setHistoryItem(viewItem); }}>View history</button><button type="button" className="button-primary" onClick={() => setViewItem(null)}>Close</button></div>
            </div>
          </div>
        );
      })()}

      {historyItem && (() => {
        const list = ordersFor(historyItem._id).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        return (
          <div className="ds-modal-backdrop" role="dialog" aria-modal="true">
            <div className="ds-modal ds-modal-wide">
              <h3>Delivery history — {historyItem.name}</h3>
              {list.length === 0 ? <p className="subtle">No assigned orders found for this staff member.</p> : (
                <div className="ds-history">
                  <table className="ds-table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Status</th><th>Total</th><th>Role</th></tr></thead>
                    <tbody>{list.map((o) => {
                      const isCurrent = o.delivery?.assignment?.assignedTo === historyItem._id;
                      const wasPrev = (o.delivery?.assignmentHistory ?? []).some((h) => h.previousStaffId === historyItem._id);
                      return (
                        <tr key={o._id}>
                          <td>#{o._id.slice(-8).toUpperCase()}</td>
                          <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</td>
                          <td>{o.customerInfo?.name || "-"}<br /><span className="subtle">{o.customerInfo?.phone || ""}</span></td>
                          <td><span className={`ds-badge ds-${o.status}`}>{o.status}</span></td>
                          <td>৳{Number(o.total || 0).toLocaleString("en-BD")}</td>
                          <td>{isCurrent ? "Current assignee" : wasPrev ? "Reassigned from" : "History"}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
              <div className="ds-modal-actions"><button type="button" className="button-primary" onClick={() => setHistoryItem(null)}>Close</button></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
