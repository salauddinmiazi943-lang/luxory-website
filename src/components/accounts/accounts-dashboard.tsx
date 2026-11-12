"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import styles from "./accounts.module.css";

type Party = { _id: string; name: string; phone?: string; type: "customer" | "supplier" | "staff" | "other" };
type Category = { _id: string; name: string; type: "expense" | "payment" };
type Transaction = {
  _id: string; type: string; amount: number; paidAmount: number; dueAmount: number; date: string; paymentMethod: string;
  partyName: string; partyId?: Party | string; category?: Category | string; note?: string; balanceSide?: string;
  revision?: number; editHistory?: { changedAt: string; changedBy: string; reason: string; before: Record<string, unknown> }[];
};
type Summary = {
  sales: number; saleReceived: number; collections: number; purchases: number; purchasePaid: number;
  supplierPayments: number; expenses: number; cashIn: number; cashOut: number; openingCash: number; closingCash: number;
  customerReceivable: number; supplierPayable: number; profitLoss: null; profitLossNote: string;
};
type Data = {
  date: string; summary: Summary; cashBalances: { method: string; opening: number; movement: number; closing: number }[];
  transactions: Transaction[]; parties: Party[]; categories: Category[];
};

const typeLabels: Record<string, string> = {
  sale: "বিক্রি", due_collection: "বাকি আদায়", purchase: "পণ্য ক্রয়", payment: "Supplier-কে পরিশোধ",
  expense: "অন্যান্য খরচ", opening_balance: "Opening balance",
};
const methodLabels: Record<string, string> = { cash: "নগদ", bkash: "বিকাশ", nagad: "নগদ (Nagad)", rocket: "রকেট", bank: "ব্যাংক", other: "অন্যান্য" };
const partyTypeLabels: Record<string, string> = { customer: "Customer", supplier: "Supplier", staff: "Staff", other: "অন্যান্য" };
const money = (value: number) => new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value || 0);
const todayDhaka = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const partyIdOf = (party: Party | string | undefined) => typeof party === "string" ? party : party?._id ?? "";
const categoryName = (category: Category | string | undefined) => typeof category === "string" ? category : category?.name ?? "—";

const emptyDraft = (date: string) => ({ type: "sale", amount: "", paidAmount: "", date, paymentMethod: "cash", partyId: "", categoryId: "", balanceSide: "cash", note: "" });

export function AccountsDashboard() {
  const [date, setDate] = useState(todayDhaka);
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState(emptyDraft(todayDhaka()));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [partyForm, setPartyForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState(false);
  const [partyDraft, setPartyDraft] = useState({ name: "", phone: "", type: "customer" });
  const [categoryDraft, setCategoryDraft] = useState({ name: "", type: "expense" });
  const [ledgerPartyId, setLedgerPartyId] = useState("");
  const [ledger, setLedger] = useState<{ party: Party; openingBalance: number; closingBalance: number; entries: (Transaction & { balanceDelta: number; runningBalance: number })[] } | null>(null);
  const createRequestKey = useRef("");
  const createRequestFingerprint = useRef("");

  const load = useCallback(async (selectedDate = date) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/accounts?date=${encodeURIComponent(selectedDate)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "হিসাব লোড করা যায়নি।");
      setData(result as Data);
      if (!editing) setDraft((current) => ({ ...current, date: selectedDate }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "হিসাব লোড করা যায়নি।");
    } finally { setLoading(false); }
  }, [date, editing]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) void load(date); }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [date, load]);

  const partyChoices = useMemo(() => {
    if (!data) return [];
    if (draft.type === "sale" || draft.type === "due_collection" || (draft.type === "opening_balance" && draft.balanceSide === "receivable")) return data.parties.filter((p) => p.type === "customer");
    if (draft.type === "purchase" || draft.type === "payment" || (draft.type === "opening_balance" && draft.balanceSide === "payable")) return data.parties.filter((p) => p.type === "supplier");
    return [];
  }, [data, draft.balanceSide, draft.type]);

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const payload: Record<string, unknown> = { ...draft };
      payload.amount = Number(draft.amount);
      payload.paidAmount = Number(draft.paidAmount || 0);
      if (!draft.partyId) delete payload.partyId;
      if (!draft.categoryId) delete payload.categoryId;
      if (editing) {
        const reason = window.prompt("এই হিসাব সম্পাদনার কারণ লিখুন:");
        if (!reason || reason.trim().length < 3) throw new Error("সম্পাদনার কারণ না দিলে সংরক্ষণ করা যাবে না।");
        payload.id = editing._id; payload.reason = reason;
        payload.expectedRevision = editing.revision ?? 0;
      } else {
        const fingerprint = JSON.stringify(payload);
        if (!createRequestKey.current || createRequestFingerprint.current !== fingerprint) {
          createRequestKey.current = crypto.randomUUID();
          createRequestFingerprint.current = fingerprint;
        }
        payload.requestKey = createRequestKey.current;
      }
      const response = await fetch(editing ? "/api/accounts" : "/api/accounts", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "লেনদেন সংরক্ষণ হয়নি।");
      setNotice(editing ? "হিসাব সংশোধন হয়েছে; আগের তথ্য ইতিহাসে রাখা হয়েছে।" : "দৈনিক হিসাব সংরক্ষণ হয়েছে।");
      setEditing(null); createRequestKey.current = ""; createRequestFingerprint.current = ""; setDraft(emptyDraft(date)); await load(date);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "লেনদেন সংরক্ষণ হয়নি।"); }
    finally { setBusy(false); }
  };

  const startEdit = (item: Transaction) => {
    const partyId = partyIdOf(item.partyId);
    const categoryId = typeof item.category === "string" ? item.category : item.category?._id ?? "";
    const dateText = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.date));
    setEditing(item);
    setDraft({ type: item.type, amount: String(item.amount), paidAmount: String(item.paidAmount), date: dateText, paymentMethod: item.paymentMethod, partyId, categoryId, balanceSide: item.balanceSide || "cash", note: item.note || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const voidTransaction = async (item: Transaction) => {
    const reason = window.prompt("লেনদেনটি বাতিল করার কারণ লিখুন। পুরোনো হিসাব ইতিহাসে থাকবে:");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item._id, reason, expectedRevision: item.revision ?? 0 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "হিসাব বাতিল হয়নি।");
      setNotice("হিসাব বাতিল হয়েছে; audit history সংরক্ষিত আছে।"); await load(date);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "হিসাব বাতিল হয়নি।"); }
    finally { setBusy(false); }
  };

  const addParty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/accounts/parties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partyDraft) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Party সংরক্ষণ হয়নি।");
      setPartyDraft({ name: "", phone: "", type: "customer" }); setPartyForm(false); setNotice("Party যোগ হয়েছে।"); await load(date);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Party সংরক্ষণ হয়নি।"); }
    finally { setBusy(false); }
  };

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/accounts/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(categoryDraft) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "খাত সংরক্ষণ হয়নি।");
      setCategoryDraft({ name: "", type: "expense" }); setCategoryForm(false); setNotice("খাত যোগ হয়েছে।"); await load(date);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "খাত সংরক্ষণ হয়নি।"); }
    finally { setBusy(false); }
  };

  const loadLedger = async (id = ledgerPartyId) => {
    if (!id) { setLedger(null); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/accounts/parties?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Party ledger পাওয়া যায়নি।");
      setLedger(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Party ledger পাওয়া যায়নি।"); }
    finally { setBusy(false); }
  };

  const downloadCsv = () => {
    if (!data) return;
    const rows = [
      ["তারিখ", "ধরন", "পার্টি", "খাত", "মোট", "পরিশোধ/আদায়", "বাকি", "মাধ্যম", "নোট"],
      ...data.transactions.map((item) => [date, typeLabels[item.type] ?? item.type, typeof item.partyId === "object" ? item.partyId.name : item.partyName, categoryName(item.category), item.amount, item.paidAmount, item.dueAmount, methodLabels[item.paymentMethod] ?? item.paymentMethod, item.note ?? ""]),
      [], ["দৈনিক বিক্রি", data.summary.sales], ["দৈনিক আদায়", data.summary.collections], ["দৈনিক ক্রয়", data.summary.purchases],
      ["Supplier-কে পরিশোধ", data.summary.supplierPayments], ["অন্যান্য খরচ", data.summary.expenses],
      ["Opening cash", data.summary.openingCash], ["Closing cash", data.summary.closingCash],
      ["প্রকৃত লাভ-ক্ষতি", "COGS না থাকায় নির্ণয় করা হয়নি"],
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `accounts-${date}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const s = data?.summary;
  return <main className={styles.root}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>ADMIN · PRIVATE ACCOUNTS</p><h1>দৈনিক হিসাব-নিকাশ</h1><p>লেনদেন, পার্টির খাতা ও দিনের নগদ স্থিতি</p></div>
      <div className={styles.actions}><label>হিসাবের তারিখ<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><button type="button" onClick={downloadCsv} disabled={!data}>CSV ডাউনলোড</button><button type="button" onClick={() => window.print()}>প্রিন্ট</button></div>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <p className={styles.info}>প্রথম দিনের প্রকৃত নগদ ও পার্টির বাকি আগে Opening balance হিসেবে লিখুন। তার আগের অজানা হিসাব সিস্টেম নিজে থেকে অনুমান করে না।</p>
    <section className={styles.grid}>
      <article className={styles.card}><span>বিক্রি</span><strong>{money(s?.sales ?? 0)}</strong><small>বিক্রির সময় আদায় {money(s?.saleReceived ?? 0)}</small></article>
      <article className={styles.card}><span>বাকি আদায়</span><strong>{money(s?.collections ?? 0)}</strong><small>দৈনিক নগদ প্রবাহে যোগ</small></article>
      <article className={styles.card}><span>পণ্য ক্রয়</span><strong>{money(s?.purchases ?? 0)}</strong><small>পরিশোধ {money(s?.purchasePaid ?? 0)}</small></article>
      <article className={styles.card}><span>Supplier-কে পরিশোধ</span><strong>{money(s?.supplierPayments ?? 0)}</strong><small>ক্রয়ের বাকি কমায়</small></article>
      <article className={styles.card}><span>অন্যান্য খরচ</span><strong>{money(s?.expenses ?? 0)}</strong><small>খাতভিত্তিক ব্যয়</small></article>
      <article className={styles.card}><span>গ্রাহকের পাওনা</span><strong>{money(s?.customerReceivable ?? 0)}</strong><small>পার্টি অনুযায়ী হিসাব</small></article>
      <article className={styles.card}><span>Supplier-কে দেনা</span><strong>{money(s?.supplierPayable ?? 0)}</strong><small>পার্টি অনুযায়ী হিসাব</small></article>
      <article className={styles.card}><span>দিনের Closing cash</span><strong>{money(s?.closingCash ?? 0)}</strong><small>Opening {money(s?.openingCash ?? 0)} · আদায় {money(s?.cashIn ?? 0)} · প্রদান {money(s?.cashOut ?? 0)}</small></article>
    </section>
    <section className={styles.panel}>
      <h2>পেমেন্ট মাধ্যম অনুযায়ী Opening ও Closing</h2>
      <div className={styles.tableWrap}><table><thead><tr><th>মাধ্যম</th><th>Opening</th><th>দিনের পরিবর্তন</th><th>Closing</th></tr></thead><tbody>{data?.cashBalances.map((row) => <tr key={row.method}><td>{methodLabels[row.method] ?? row.method}</td><td>{money(row.opening)}</td><td>{money(row.movement)}</td><td><strong>{money(row.closing)}</strong></td></tr>)}</tbody></table></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionTitle}><div><h2>{editing ? "লেনদেন সম্পাদনা" : "দৈনিক এন্ট্রি যোগ"}</h2><p>Admin-এর এন্ট্রি MongoDB-তে সংরক্ষিত হবে।</p></div><div className={styles.actions}><button type="button" onClick={() => { setPartyForm((v) => !v); setCategoryForm(false); }}>Party যোগ</button><button type="button" onClick={() => { setCategoryForm((v) => !v); setPartyForm(false); }}>খাত যোগ</button></div></div>
      <form className={styles.form} onSubmit={submitTransaction}>
        <label>লেনদেনের ধরন<select value={draft.type} disabled={!!editing} onChange={(e) => { const type = e.target.value; setDraft((v) => ({ ...v, type, partyId: "", categoryId: "", balanceSide: type === "opening_balance" ? "cash" : v.balanceSide })); }}>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>তারিখ<input type="date" required value={draft.date} onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))} /></label>
        <label>মোট টাকা<input type="number" min="0.01" step="0.01" required value={draft.amount} onChange={(e) => setDraft((v) => ({ ...v, amount: e.target.value }))} /></label>
        {(draft.type === "sale" || draft.type === "purchase") && <label>{draft.type === "sale" ? "বিক্রির সময় আদায়" : "ক্রয়ের সময় পরিশোধ"}<input type="number" min="0" step="0.01" required value={draft.paidAmount} onChange={(e) => setDraft((v) => ({ ...v, paidAmount: e.target.value }))} /></label>}
        {draft.type === "opening_balance" && <label>Opening balance-এর ধরন<select value={draft.balanceSide} onChange={(e) => setDraft((v) => ({ ...v, balanceSide: e.target.value, partyId: "" }))}><option value="cash">Cash balance</option><option value="receivable">Customer-এর পাওনা</option><option value="payable">Supplier-এর দেনা</option></select></label>}
        {partyChoices.length > 0 && <label>Customer / Supplier<select required value={draft.partyId} onChange={(e) => setDraft((v) => ({ ...v, partyId: e.target.value }))}><option value="">নির্বাচন করুন</option>{partyChoices.map((party) => <option key={party._id} value={party._id}>{party.name}{party.phone ? ` · ${party.phone}` : ""}</option>)}</select></label>}
        {(draft.type === "expense" || draft.type === "payment") && <label>খাত<select required value={draft.categoryId} onChange={(e) => setDraft((v) => ({ ...v, categoryId: e.target.value }))}><option value="">খাত নির্বাচন করুন</option>{data?.categories.filter((category) => category.type === (draft.type === "expense" ? "expense" : "payment")).map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>}
        {draft.type !== "opening_balance" || draft.balanceSide === "cash" ? <label>পেমেন্ট মাধ্যম<select value={draft.paymentMethod} onChange={(e) => setDraft((v) => ({ ...v, paymentMethod: e.target.value }))}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
        <label className={styles.wide}>নোট<textarea rows={2} maxLength={2000} value={draft.note} onChange={(e) => setDraft((v) => ({ ...v, note: e.target.value }))} /></label>
        <div className={styles.formActions}><button type="submit" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে…" : editing ? "পরিবর্তন সংরক্ষণ" : "হিসাব যোগ করুন"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(emptyDraft(date)); }}>বাতিল</button>}</div>
      </form>
      {partyForm && <form className={styles.inlineForm} onSubmit={addParty}><h3>নতুন Party</h3><input required placeholder="নাম" value={partyDraft.name} onChange={(e) => setPartyDraft((v) => ({ ...v, name: e.target.value }))} /><input placeholder="ফোন" value={partyDraft.phone} onChange={(e) => setPartyDraft((v) => ({ ...v, phone: e.target.value }))} /><select value={partyDraft.type} onChange={(e) => setPartyDraft((v) => ({ ...v, type: e.target.value }))}>{Object.entries(partyTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button disabled={busy}>Party সংরক্ষণ</button></form>}
      {categoryForm && <form className={styles.inlineForm} onSubmit={addCategory}><h3>নতুন খাত</h3><input required maxLength={100} placeholder="খাতের নাম" value={categoryDraft.name} onChange={(e) => setCategoryDraft((v) => ({ ...v, name: e.target.value }))} /><select value={categoryDraft.type} onChange={(e) => setCategoryDraft((v) => ({ ...v, type: e.target.value }))}><option value="expense">খরচ</option><option value="payment">পরিশোধ</option></select><button disabled={busy}>খাত সংরক্ষণ</button></form>}
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionTitle}><div><h2>{date} · দৈনিক লেনদেন</h2><p>{loading ? "লোড হচ্ছে…" : `${data?.transactions.length ?? 0}টি এন্ট্রি`}</p></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>ধরন / সময়</th><th>Party / খাত</th><th>মোট</th><th>আদায় / পরিশোধ</th><th>বাকি</th><th>নোট</th><th className={styles.noPrint}>Admin কাজ</th></tr></thead><tbody>
        {data?.transactions.map((item) => <tr key={item._id}><td><strong>{typeLabels[item.type] ?? item.type}</strong><small>{new Intl.DateTimeFormat("bn-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(new Date(item.date))} · {methodLabels[item.paymentMethod] ?? item.paymentMethod}</small></td><td>{typeof item.partyId === "object" ? item.partyId.name : item.partyName}<small>{categoryName(item.category)}</small></td><td>{money(item.amount)}</td><td>{money(item.paidAmount)}</td><td>{money(item.dueAmount)}</td><td>{item.note || "—"}{Boolean(item.editHistory?.length) && <details><summary>ইতিহাস ({item.editHistory?.length})</summary>{item.editHistory?.map((h, i) => <small key={`${h.changedAt}-${i}`}>{new Date(h.changedAt).toLocaleString("bn-BD")} · {h.reason}</small>)}</details>}</td><td className={styles.noPrint}><button type="button" onClick={() => startEdit(item)}>সম্পাদনা</button><button type="button" className={styles.danger} disabled={busy} onClick={() => voidTransaction(item)}>বাতিল</button></td></tr>)}
        {!loading && !data?.transactions.length && <tr><td colSpan={7} className={styles.empty}>এই তারিখে কোনো হিসাব নেই। এন্ট্রি যোগ করুন।</td></tr>}
      </tbody></table></div>
    </section>
    <section className={styles.panel}>
      <h2>Customer / Supplier Party Ledger</h2><div className={styles.ledgerControls}><select value={ledgerPartyId} onChange={(e) => { setLedgerPartyId(e.target.value); setLedger(null); }}><option value="">পার্টি নির্বাচন করুন</option>{data?.parties.filter((p) => p.type === "customer" || p.type === "supplier").map((p) => <option key={p._id} value={p._id}>{partyTypeLabels[p.type]} · {p.name}</option>)}</select><button type="button" disabled={!ledgerPartyId || busy} onClick={() => void loadLedger()}>খাতা দেখুন</button><button type="button" disabled={!ledger} onClick={() => window.print()}>খাতা প্রিন্ট</button></div>
      {ledger && <><p>{ledger.party.name} · Opening {money(ledger.openingBalance)} · Closing {money(ledger.closingBalance)}</p><div className={styles.tableWrap}><table><thead><tr><th>তারিখ</th><th>লেনদেন</th><th>মোট</th><th>বাকি পরিবর্তন</th><th>চলতি স্থিতি</th></tr></thead><tbody>{ledger.entries.map((item) => <tr key={item._id}><td>{new Intl.DateTimeFormat("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium" }).format(new Date(item.date))}</td><td>{typeLabels[item.type] ?? item.type}</td><td>{money(item.amount)}</td><td>{money(item.balanceDelta)}</td><td>{money(item.runningBalance)}</td></tr>)}{!ledger.entries.length && <tr><td colSpan={5} className={styles.empty}>এই সময়ে কোনো এন্ট্রি নেই।</td></tr>}</tbody></table></div></>}
    </section>
    <section className={styles.profitNote}><strong>লাভ-ক্ষতি</strong><p>বিক্রি, ক্রয় ও নগদ প্রবাহ আলাদা দেখানো হচ্ছে। পণ্যের প্রকৃত ক্রয়মূল্য/COGS না থাকায় প্রকৃত লাভ-ক্ষতি হিসাব করা হয়নি; অনুমানভিত্তিক লাভ দেখানো হবে না।</p></section>
  </main>;
}
