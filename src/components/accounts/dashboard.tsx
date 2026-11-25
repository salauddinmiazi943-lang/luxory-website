"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

type Kind = "sale" | "collection" | "purchase" | "supplier_payment" | "expense" | "other_income";
type Method = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "other";
type Party = { _id: string; name: string; type: "customer" | "supplier"; phone?: string; address?: string; openingBalancePaisa?: number; balancePaisa: number };
type Category = { _id: string; name: string; type: "income" | "expense" };
type Entry = { _id: string; type: Kind; date: string; amountPaisa: number; paidPaisa: number; method: Method; partyId?: string; partyName?: string; categoryId?: string; categoryName?: string; note?: string; audit?: unknown[] };
type Report = { byDay: { _id: string; sales: number; income: number; costs: number }[]; byCategory: { _id: { name: string }; amountPaisa: number }[]; summary: { _id: Kind; amountPaisa: number; paidPaisa: number }[]; note: string };
type ApiResult<T> = { items?: T[]; error?: string; totals?: { _id: Kind; amount: number; paid: number }[] };

const methods: { value: Method; label: string }[] = [
  { value: "cash", label: "নগদ" }, { value: "bkash", label: "বিকাশ" }, { value: "nagad", label: "নগদ (Nagad)" },
  { value: "rocket", label: "রকেট" }, { value: "bank", label: "ব্যাংক" }, { value: "other", label: "অন্যান্য" },
];
const types: { value: Kind; label: string }[] = [
  { value: "sale", label: "বিক্রি" }, { value: "collection", label: "বাকি আদায়" }, { value: "purchase", label: "পণ্য ক্রয়" },
  { value: "supplier_payment", label: "সরবরাহকারীকে পরিশোধ" }, { value: "expense", label: "অন্যান্য খরচ" }, { value: "other_income", label: "অন্যান্য আয়" },
];
const money = (paisa = 0) => `৳${(paisa / 100).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const methodLabel = (method: string) => methods.find((item) => item.value === method)?.label ?? method;
const typeLabel = (type: string) => types.find((item) => item.value === type)?.label ?? type;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "অনুরোধটি সম্পন্ন হয়নি");
  return data;
}

function periodRange(period: string, date: string) {
  const selected = new Date(`${date}T12:00:00`);
  const y = selected.getFullYear(); const m = selected.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let from = new Date(y, m, selected.getDate()); let to = new Date(y, m, selected.getDate());
  if (period === "week") { const day = (selected.getDay() + 6) % 7; from = new Date(y, m, selected.getDate() - day); to = new Date(y, m, selected.getDate() - day + 6); }
  if (period === "month") { from = new Date(y, m, 1); to = new Date(y, m + 1, 0); }
  if (period === "half") { const startMonth = m < 6 ? 0 : 6; from = new Date(y, startMonth, 1); to = new Date(y, startMonth + 6, 0); }
  if (period === "year") { from = new Date(y, 0, 1); to = new Date(y, 11, 31); }
  const todayAtNoon = new Date(`${today()}T12:00:00`);
  if (to > todayAtNoon) to = todayAtNoon;
  return { from: iso(from), to: iso(to) };
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const content = "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = href; a.download = name; a.click(); URL.revokeObjectURL(href);
}

function evaluateCalculator(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d*)?|\.\d+|[()+\-*/%]/g) ?? [];
  if (!tokens.length || tokens.join("") !== expression.replace(/\s/g, "")) throw new Error("অসম্পূর্ণ হিসাব");
  let position = 0;
  const factor = (): number => {
    const token = tokens[position++];
    let value: number;
    if (token === "+") value = factor();
    else if (token === "-") value = -factor();
    else if (token === "(") {
      value = expressionPart();
      if (tokens[position++] !== ")") throw new Error("বন্ধনী মেলেনি");
    } else if (token && (/^\d/.test(token) || /^\./.test(token))) value = Number(token);
    else throw new Error("হিসাবটি ঠিক করে লিখুন");
    while (tokens[position] === "%") { position++; value /= 100; }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++]; const right = factor();
      if (operator === "/" && right === 0) throw new Error("শূন্য দিয়ে ভাগ করা যায় না");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const expressionPart = (): number => {
    let value = term();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++]; const right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = expressionPart();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error("হিসাবের ফল দেখানো যাচ্ছে না");
  return Number(result.toPrecision(12));
}

function formatCalculatorResult(value: number): string {
  return value.toLocaleString("bn-BD", { maximumSignificantDigits: 12, useGrouping: true });
}

export function AccountsDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<Entry[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openings, setOpenings] = useState<{ method: Method; amountPaisa: number }[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [reportPeriod, setReportPeriod] = useState("week");
  const [partyLedger, setPartyLedger] = useState<{ party: Party; items: (Entry & { balancePaisa: number })[]; balancePaisa: number } | null>(null);
  const [managers, setManagers] = useState<{ id: string; name: string; email: string; active: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCalculator, setShowCalculator] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterParty, setFilterParty] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [form, setForm] = useState({ type: "sale" as Kind, amount: "", paid: "", method: "cash" as Method, partyId: "", partyName: "", categoryId: "", note: "" });
  const [partyForm, setPartyForm] = useState({ name: "", type: "customer" as "customer" | "supplier", phone: "", address: "", openingBalance: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", type: "expense" as "income" | "expense" });
  const [openingForm, setOpeningForm] = useState({ method: "cash" as Method, amount: "" });
  const [calculator, setCalculator] = useState({ expression: "", display: "0", error: "", evaluated: false });

  const loadDaily = useCallback(async () => {
    setError("");
    try {
      const [daily, partyData, categoryData, openingData] = await Promise.all([
        api<ApiResult<Entry>>(`/api/accounts?date=${date}`), api<ApiResult<Party>>("/api/accounts/parties"),
        api<ApiResult<Category>>("/api/accounts/categories"), api<{ items?: { method: Method; amountPaisa: number }[] }>(`/api/accounts/openings?date=${date}`),
      ]);
      setItems(daily.items ?? []); setParties(partyData.items ?? []); setCategories(categoryData.items ?? []); setOpenings(openingData.items ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "তথ্য আনা যায়নি"); }
  }, [date]);

  const loadManagers = useCallback(async () => {
    if (!isAdmin) return;
    try { const data = await api<ApiResult<{ id: string; name: string; email: string; active: boolean }>>("/api/accounts/access"); setManagers(data.items ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ম্যানেজার তালিকা আনা যায়নি"); }
  }, [isAdmin]);

  useEffect(() => { const timer = window.setTimeout(() => void loadDaily(), 0); return () => window.clearTimeout(timer); }, [loadDaily]);
  useEffect(() => { if (tab !== "access") return; const timer = window.setTimeout(() => void loadManagers(), 0); return () => window.clearTimeout(timer); }, [tab, loadManagers]);

  const typeNeedsParty = ["sale", "collection", "purchase", "supplier_payment"].includes(form.type);
  const partyType = ["sale", "collection"].includes(form.type) ? "customer" : "supplier";
  const eligibleParties = parties.filter((party) => party.type === partyType);
  const selectedParty = parties.find((party) => party._id === form.partyId);

  const cashRows = useMemo(() => methods.map(({ value, label }) => {
    const opening = openings.find((entry) => entry.method === value)?.amountPaisa ?? 0;
    const change = items.reduce((total, item) => {
      if (item.method !== value) return total;
      if (item.type === "sale") return total + item.paidPaisa;
      if (item.type === "collection" || item.type === "other_income") return total + item.amountPaisa;
      if (item.type === "purchase") return total - item.paidPaisa;
      return total - (item.type === "supplier_payment" || item.type === "expense" ? item.amountPaisa : 0);
    }, 0);
    return { method: value, label, opening, change, closing: opening + change };
  }), [items, openings]);

  const customerDue = parties.filter((p) => p.type === "customer").reduce((sum, p) => sum + p.balancePaisa, 0);
  const supplierDue = parties.filter((p) => p.type === "supplier").reduce((sum, p) => sum + p.balancePaisa, 0);
  const dailyTotals = useMemo(() => items.reduce((result, item) => {
    result[item.type] = (result[item.type] ?? 0) + (item.type === "sale" || item.type === "purchase" ? item.amountPaisa : item.amountPaisa);
    return result;
  }, {} as Record<string, number>), [items]);
  const dailyCollected = items.filter((item) => item.type === "collection" || item.type === "sale").reduce((sum, item) => sum + (item.type === "sale" ? item.paidPaisa : item.amountPaisa), 0);
  const dailyClosing = cashRows.reduce((sum, item) => sum + item.closing, 0);
  const filteredItems = items.filter((item) => (!filterType || item.type === filterType) && (!filterMethod || item.method === filterMethod) && (!filterParty || item.partyId === filterParty));

  async function saveTransaction(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const amount = Number(form.amount); const paid = Number(form.paid || 0);
      const payload = { type: form.type, date, amount, paid: ["sale", "purchase"].includes(form.type) ? paid : 0, method: form.method, partyId: typeNeedsParty ? form.partyId || null : null, categoryId: form.categoryId || null, note: form.note };
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("সঠিক টাকার পরিমাণ লিখুন");
      if (["sale", "purchase"].includes(form.type) && paid > amount) throw new Error("জমার টাকা মোট টাকার বেশি হতে পারবে না");
      if (typeNeedsParty && !form.partyId) throw new Error(form.partyName.trim() ? "এই নামটি নতুন হলে আগে ‘নতুন পার্টি যোগ’ চাপুন" : "গ্রাহক বা সরবরাহকারীর নাম লিখুন");
      await api(editing ? `/api/accounts/${editing._id}` : "/api/accounts", { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? { date, amount, paid, method: form.method, note: form.note } : payload) });
      setForm({ type: "sale", amount: "", paid: "", method: "cash", partyId: "", partyName: "", categoryId: "", note: "" }); setEditing(null); setNotice(editing ? "হিসাব আপডেট হয়েছে" : "হিসাব যোগ হয়েছে"); await loadDaily();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "হিসাব সংরক্ষণ হয়নি"); }
    finally { setBusy(false); }
  }

  function beginEdit(item: Entry) {
    setEditing(item); setDate(item.date.slice(0, 10));
    setForm({ type: item.type, amount: String(item.amountPaisa / 100), paid: String(item.paidPaisa / 100), method: item.method, partyId: item.partyId ?? "", partyName: item.partyName ?? "", categoryId: item.categoryId ?? "", note: item.note ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelTransaction(item: Entry) {
    if (!window.confirm("এই হিসাবটি বাতিল করবেন? এটি মুছে না গিয়ে বাতিল হিসেবে থাকবে।")) return;
    try { await api(`/api/accounts/${item._id}`, { method: "DELETE" }); setNotice("হিসাব বাতিল হয়েছে"); await loadDaily(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "হিসাব বাতিল হয়নি"); }
  }

  async function createParty(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/accounts/parties", { method: "POST", body: JSON.stringify({ ...partyForm, openingBalance: Number(partyForm.openingBalance || 0) }) }); setPartyForm({ name: "", type: "customer", phone: "", address: "", openingBalance: "" }); setNotice("পার্টি যোগ হয়েছে"); await loadDaily(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "পার্টি যোগ হয়নি"); }
    finally { setBusy(false); }
  }

  async function quickAddParty() {
    const name = form.partyName.trim();
    if (name.length < 2) { setError("পার্টির নাম অন্তত ২ অক্ষরের লিখুন"); return; }
    const existing = eligibleParties.find((party) => party.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) { setForm((current) => ({ ...current, partyId: existing._id, partyName: existing.name })); setNotice("আগের পার্টির নাম নির্বাচন হয়েছে"); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ item: Party }>("/api/accounts/parties", { method: "POST", body: JSON.stringify({ name, type: partyType, phone: "", address: "", openingBalance: 0 }) });
      setForm((current) => ({ ...current, partyId: result.item._id, partyName: result.item.name }));
      setNotice("নতুন পার্টি যোগ হয়েছে; এখন হিসাব সংরক্ষণ করুন"); await loadDaily();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "পার্টি যোগ হয়নি"); }
    finally { setBusy(false); }
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/accounts/categories", { method: "POST", body: JSON.stringify(categoryForm) }); setCategoryForm({ name: "", type: "expense" }); setNotice("খাত যোগ হয়েছে"); await loadDaily(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "খাত যোগ হয়নি"); }
    finally { setBusy(false); }
  }

  async function saveOpening(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/accounts/openings", { method: "PUT", body: JSON.stringify({ date, method: openingForm.method, amount: Number(openingForm.amount || 0) }) }); setNotice("শুরুর ব্যালেন্স সংরক্ষিত হয়েছে"); await loadDaily(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ব্যালেন্স সংরক্ষণ হয়নি"); }
    finally { setBusy(false); }
  }

  async function toggleManager(manager: (typeof managers)[number]) {
    try { await api("/api/accounts/access", { method: "PUT", body: JSON.stringify({ userId: manager.id, active: !manager.active }) }); setManagers((all) => all.map((one) => one.id === manager.id ? { ...one, active: !one.active } : one)); setNotice(manager.active ? "ম্যানেজারের অ্যাক্সেস বন্ধ হয়েছে" : "ম্যানেজারকে অ্যাক্সেস দেওয়া হয়েছে"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "অ্যাক্সেস বদলানো যায়নি"); }
  }

  const openReport = useCallback(async () => {
    setBusy(true); setError("");
    try { const range = periodRange(reportPeriod, date); const data = await api<Report>(`/api/accounts/reports?from=${range.from}&to=${range.to}`); setReport(data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "রিপোর্ট তৈরি হয়নি"); }
    finally { setBusy(false); }
  }, [date, reportPeriod]);
  useEffect(() => { if (tab !== "reports") return; const timer = window.setTimeout(() => void openReport(), 0); return () => window.clearTimeout(timer); }, [tab, openReport]);

  async function openLedger(party: Party) {
    try { const data = await api<{ party: Party; items: (Entry & { balancePaisa: number })[]; balancePaisa: number }>(`/api/accounts/parties/${party._id}`); setPartyLedger(data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "খাতা খোলা যায়নি"); }
  }

  function calculatorKey(key: string) {
    setCalculator((current) => {
      if (key === "Escape" || key.toLowerCase() === "c" || key.toUpperCase() === "AC") return { expression: "", display: "0", error: "", evaluated: false };
      if (key === "Backspace") return { ...current, expression: current.expression.slice(0, -1), error: "", evaluated: false };
      if (key === "±") return { ...current, expression: current.expression ? `-(${current.expression})` : "-", display: current.expression ? `-(${current.expression})` : "-", error: "", evaluated: false };
      if (key === "Enter" || key === "=") {
        if (!current.expression) return current;
        try { const result = evaluateCalculator(current.expression); return { expression: String(result), display: formatCalculatorResult(result), error: "", evaluated: true }; }
        catch (reason) { return { ...current, error: reason instanceof Error ? reason.message : "হিসাবটি যাচাই করুন" }; }
      }
      const token = key === "−" ? "-" : key === "×" ? "*" : key === "÷" ? "/" : key;
      if (/^(?:\d+|\.)$/.test(token) || ["+", "-", "*", "/", "%", "(", ")"].includes(token)) {
        const startsNew = current.evaluated && (/^(?:\d+|\.)$/.test(token) || token === "(");
        const expression = startsNew ? token : current.expression + token;
        return { expression, display: expression || "0", error: "", evaluated: false };
      }
      return current;
    });
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!showCalculator) return;
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (/^\d$/.test(event.key) || [".", "+", "-", "*", "/", "%", "(", ")", "Enter", "Escape", "Backspace", "="].includes(event.key)) {
        event.preventDefault(); calculatorKey(event.key === "-" ? "−" : event.key === "*" ? "×" : event.key === "/" ? "÷" : event.key);
      }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [showCalculator]);

  const reportTotals = useMemo(() => (report?.summary ?? []).reduce((acc, row) => { acc[row._id] = row.amountPaisa; return acc; }, {} as Record<string, number>), [report]);
  const reportIncome = (reportTotals.sale ?? 0) + (reportTotals.other_income ?? 0);
  const reportExpense = (reportTotals.purchase ?? 0) + (reportTotals.expense ?? 0);
  const reportProfit = reportIncome - reportExpense;
  const maxChart = Math.max(1, ...(report?.byDay ?? []).flatMap((point) => [point.sales + point.income, point.costs]));
  const pieStyle = useMemo(() => {
    const values = report?.byCategory ?? [];
    const total = values.reduce((sum, row) => sum + row.amountPaisa, 0);
    if (!total) return undefined;
    const colors = ["#4f8063", "#c29a58", "#7296a0", "#b56d5b", "#89956b", "#86749b"];
    let cursor = 0;
    const slices = values.map((row, index) => {
      const start = cursor; cursor += row.amountPaisa / total * 100;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    });
    return { background: `conic-gradient(${slices.join(",")})` };
  }, [report]);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div><span className={styles.eyebrow}>LUXORA · BUSINESS DESK</span><h1>হিসাব-নিকাশ</h1><p>প্রতিদিনের লেনদেন, পার্টি খাতা ও ব্যবসার রিপোর্ট—এক জায়গায়।</p></div>
        <div className={styles.heroActions}><label>হিসাবের তারিখ<input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" className={styles.lightButton} onClick={() => window.print()}>প্রিন্ট / PDF</button></div>
      </header>
      <nav className={styles.tabs} aria-label="হিসাবের বিভাগ">
        {[["daily", "দৈনিক হিসাব"], ["parties", "পার্টি খাতা"], ["reports", "রিপোর্ট"], ["settings", "খাত ও ব্যালেন্স"], ...(isAdmin ? [["access", "ম্যানেজার অ্যাক্সেস"]] : [])].map(([key, label]) => <button type="button" key={key} className={tab === key ? styles.activeTab : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>
      {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}

      {tab === "daily" && <>
        <section className={styles.cards}>
          <Metric title="মোট বিক্রি" value={money(dailyTotals.sale)} tone="green" /><Metric title="আজ জমা হয়েছে" value={money(dailyCollected)} tone="blue" /><Metric title="পণ্য কেনা" value={money(dailyTotals.purchase)} tone="gold" /><Metric title="অন্যান্য খরচ" value={money(dailyTotals.expense)} tone="rose" />
          <Metric title="গ্রাহকের কাছ থেকে পাওনা" value={money(customerDue)} /><Metric title="সরবরাহকারীকে বাকি" value={money(supplierDue)} /><Metric title="দিন শেষে মোট ব্যালেন্স" value={money(dailyClosing)} tone="green" />
        </section>
        <div className={styles.mainGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>নতুন লেনদেন</span><h2>{editing ? "হিসাব সম্পাদনা" : "দৈনিক এন্ট্রি যোগ"}</h2></div>{editing && <button className={styles.textButton} type="button" onClick={() => { setEditing(null); setForm({ type: "sale", amount: "", paid: "", method: "cash", partyId: "", partyName: "", categoryId: "", note: "" }); }}>বাতিল</button>}</div>
            <p className={styles.hint}>সহজে হিসাব যোগ করতে: <strong>১. তারিখ ও লেনদেন বাছুন</strong> → <strong>২. টাকার অঙ্ক ও যার সঙ্গে লেনদেন তার নাম লিখুন</strong> → <strong>৩. হিসাব সংরক্ষণ চাপুন</strong>। টাকার অঙ্ক দশমিকসহ লিখতে পারবেন।</p>
            <form className={styles.form} onSubmit={saveTransaction}>
              <label>তারিখ<input type="date" max={today()} required value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label>লেনদেনের ধরন<select value={form.type} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, type: e.target.value as Kind, partyId: "", partyName: "", categoryId: "" })}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              <label>মোট টাকা<input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="০.০০" /></label>
              {["sale", "purchase"].includes(form.type) && <label>{form.type === "sale" ? "বিক্রির সময় জমা" : "ক্রয়ের সময় পরিশোধ"}<input type="number" min="0" step="0.01" max={form.amount || undefined} value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} placeholder="০.০০" /></label>}
              <label>পেমেন্ট মাধ্যম<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Method })}>{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              {typeNeedsParty && <div className={styles.partyEntry}><label>{partyType === "customer" ? "গ্রাহকের নাম" : "সরবরাহকারীর নাম"}<input list="account-party-options" required value={form.partyName} onChange={(e) => { const value = e.target.value; const match = eligibleParties.find((party) => party.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase()); setForm({ ...form, partyName: value, partyId: match?._id ?? "" }); }} placeholder={partyType === "customer" ? "গ্রাহকের নাম লিখুন বা বাছুন" : "সরবরাহকারীর নাম লিখুন বা বাছুন"} /><datalist id="account-party-options">{eligibleParties.map((party) => <option key={party._id} value={party.name}>{money(party.balancePaisa)}</option>)}</datalist></label><button className={styles.lightButton} type="button" onClick={() => void quickAddParty()} disabled={busy}>{form.partyId ? "পার্টি নির্বাচিত" : "নতুন পার্টি যোগ"}</button></div>}
              {categories.length > 0 && <label>খাত<select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">খাত নির্বাচন (ঐচ্ছিক)</option>{categories.filter((c) => ["expense", "purchase", "supplier_payment"].includes(form.type) ? c.type === "expense" : c.type === "income").map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>}
              <label className={styles.full}>নোট<textarea rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="লেনদেনের বিবরণ" /></label>
              {selectedParty && <p className={`${styles.hint} ${styles.full}`}>এই পার্টির বর্তমান {selectedParty.type === "customer" ? "পাওনা" : "দেনা"}: <strong>{money(selectedParty.balancePaisa)}</strong></p>}
              <button className={styles.primaryButton} disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে…" : editing ? "পরিবর্তন সংরক্ষণ" : "হিসাব সংরক্ষণ"}</button>
            </form>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>কোথায় কত টাকা আছে</span><h2>দিনের শুরু ও শেষের ব্যালেন্স</h2></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>টাকা রাখার মাধ্যম</th><th>দিনের শুরু</th><th>আজ যোগ / বিয়োগ</th><th>দিন শেষে</th></tr></thead><tbody>{cashRows.map((row) => <tr key={row.method}><td>{row.label}</td><td>{money(row.opening)}</td><td className={row.change >= 0 ? styles.positive : styles.negative}>{row.change >= 0 ? "+" : "−"}{money(Math.abs(row.change))}</td><td><strong>{money(row.closing)}</strong></td></tr>)}</tbody></table></div>
            {isAdmin && <form className={styles.inlineForm} onSubmit={saveOpening}><select value={openingForm.method} onChange={(e) => setOpeningForm({ ...openingForm, method: e.target.value as Method })}>{methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select><input aria-label="শুরুর ব্যালেন্স" type="number" min="0" step="0.01" value={openingForm.amount} onChange={(e) => setOpeningForm({ ...openingForm, amount: e.target.value })} placeholder="Opening balance" required /><button disabled={busy}>ব্যালেন্স সেট</button></form>}
            <p className={styles.hint}>প্রতিটি দিনের Opening Balance অ্যাডমিন নির্ধারণ করেন। সিস্টেম পুরোনো নগদ বা বাকি নিজে থেকে অনুমান করে না।</p>
          </section>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>{date}</span><h2>লেনদেনের তালিকা</h2></div><button className={styles.lightButton} onClick={() => downloadCsv(`daily-accounts-${date}.csv`, [["তারিখ", "ধরন", "পার্টি", "খাত", "মাধ্যম", "মোট", "জমা", "বাকি", "নোট"], ...filteredItems.map((item) => [date, typeLabel(item.type), item.partyName ?? "", item.categoryName ?? "", methodLabel(item.method), (item.amountPaisa / 100).toFixed(2), (item.paidPaisa / 100).toFixed(2), (Math.max(0, item.amountPaisa - item.paidPaisa) / 100).toFixed(2), item.note ?? ""])])}>CSV ডাউনলোড</button></div>
          <div className={styles.filters}><select value={filterType} onChange={(e) => setFilterType(e.target.value)}><option value="">সব ধরন</option>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><select value={filterParty} onChange={(e) => setFilterParty(e.target.value)}><option value="">সব পার্টি</option>{parties.map((party) => <option key={party._id} value={party._id}>{party.name}</option>)}</select><select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}><option value="">সব মাধ্যম</option>{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
          <div className={styles.tableWrap}><table><thead><tr><th>ধরন</th><th>পার্টি / খাত</th><th>মাধ্যম</th><th>মোট</th><th>জমা</th><th>বাকি</th><th>নোট</th><th className={styles.noPrint}>কাজ</th></tr></thead><tbody>{filteredItems.length ? filteredItems.map((item) => <tr key={item._id}><td>{typeLabel(item.type)}</td><td>{item.partyName || "—"}<small>{item.categoryName}</small></td><td>{methodLabel(item.method)}</td><td>{money(item.amountPaisa)}</td><td>{money(item.paidPaisa)}</td><td>{money(Math.max(0, item.amountPaisa - item.paidPaisa))}</td><td>{item.note || "—"}</td><td className={styles.noPrint}><button className={styles.textButton} onClick={() => beginEdit(item)}>সম্পাদনা</button>{isAdmin && <button className={styles.dangerText} onClick={() => void cancelTransaction(item)}>বাতিল</button>}</td></tr>) : <tr><td colSpan={8} className={styles.empty}>এই তারিখে কোনো হিসাব নেই। নতুন এন্ট্রি যোগ করুন।</td></tr>}</tbody></table></div>
        </section>
      </>}

      {tab === "parties" && <section className={styles.mainGrid}>
        <section className={styles.panel}><span className={styles.eyebrow}>পার্টি তৈরি</span><h2>গ্রাহক বা সরবরাহকারী যোগ করুন</h2><form className={styles.form} onSubmit={createParty}><label>ধরন<select value={partyForm.type} onChange={(e) => setPartyForm({ ...partyForm, type: e.target.value as "customer" | "supplier" })}><option value="customer">গ্রাহক</option><option value="supplier">সরবরাহকারী</option></select></label><label>নাম<input required minLength={2} maxLength={120} value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} /></label><label>ফোন<input maxLength={40} value={partyForm.phone} onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })} /></label><label>শুরুর বাকি / পাওনা<input type="number" min="0" step="0.01" value={partyForm.openingBalance} onChange={(e) => setPartyForm({ ...partyForm, openingBalance: e.target.value })} /></label><label className={styles.full}>ঠিকানা<input maxLength={500} value={partyForm.address} onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })} /></label><button className={styles.primaryButton} disabled={busy}>পার্টি যোগ করুন</button></form></section>
        <section className={styles.panel}><span className={styles.eyebrow}>Customer & Supplier</span><h2>পার্টি লেজার</h2><div className={styles.tableWrap}><table><thead><tr><th>নাম</th><th>ধরন</th><th>ফোন</th><th>বর্তমান ব্যালেন্স</th><th></th></tr></thead><tbody>{parties.map((party) => <tr key={party._id}><td>{party.name}</td><td>{party.type === "customer" ? "গ্রাহক" : "সরবরাহকারী"}</td><td>{party.phone || "—"}</td><td className={party.balancePaisa < 0 ? styles.positive : ""}>{money(party.balancePaisa)}</td><td><button className={styles.textButton} onClick={() => void openLedger(party)}>খাতা দেখুন</button></td></tr>)}</tbody></table></div></section>
        {partyLedger && <section className={`${styles.panel} ${styles.fullPanel}`}><div className={styles.panelHeading}><div><span className={styles.eyebrow}>ব্যক্তিগত স্টেটমেন্ট</span><h2>{partyLedger.party.name}</h2><p>বর্তমান ব্যালেন্স: <strong>{money(partyLedger.balancePaisa)}</strong></p></div><div><button className={styles.lightButton} onClick={() => window.print()}>প্রিন্ট / PDF</button> <button className={styles.textButton} onClick={() => setPartyLedger(null)}>বন্ধ</button></div></div><div className={styles.tableWrap}><table><thead><tr><th>তারিখ</th><th>লেনদেন</th><th>মোট</th><th>পাওনা/পরিশোধ</th><th>চলতি ব্যালেন্স</th><th>নোট</th></tr></thead><tbody>{partyLedger.items.map((item) => <tr key={item._id}><td>{String(item.date).slice(0, 10)}</td><td>{typeLabel(item.type)}</td><td>{money(item.amountPaisa)}</td><td>{money(Math.abs(item.deltaPaisa))}</td><td>{money(item.balancePaisa)}</td><td>{item.note || "—"}</td></tr>)}</tbody></table></div></section>}
      </section>}

      {tab === "reports" && <section className={styles.panel}><div className={styles.panelHeading}><div><span className={styles.eyebrow}>ব্যবসার সারাংশ</span><h2>সময়ভিত্তিক আয়-ব্যয়</h2></div><div className={styles.filters}><select value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}><option value="week">সাপ্তাহিক</option><option value="month">মাসিক</option><option value="half">অর্ধ-বার্ষিক</option><option value="year">বার্ষিক</option></select><button className={styles.lightButton} onClick={() => window.print()}>প্রিন্ট / PDF</button>{report && <button className={styles.lightButton} onClick={() => downloadCsv(`accounts-report-${reportPeriod}-${date}.csv`, [["তারিখ", "বিক্রি", "অন্যান্য আয়", "ক্রয় ও খরচ"], ...report.byDay.map((d) => [d._id, d.sales / 100, d.income / 100, d.costs / 100])])}>CSV</button>}</div></div>
        <div className={styles.cards}><Metric title="মোট বিক্রি" value={money(reportTotals.sale)} tone="green" /><Metric title="বাকি আদায়" value={money(reportTotals.collection)} tone="blue" /><Metric title="পণ্য ক্রয়" value={money(reportTotals.purchase)} tone="gold" /><Metric title="অন্যান্য খরচ" value={money(reportTotals.expense)} tone="rose" /><Metric title="মোট আয়" value={money(reportIncome)} /><Metric title="হিসাবি উদ্বৃত্ত" value={money(reportProfit)} tone={reportProfit >= 0 ? "green" : "rose"} /></div>
        <p className={styles.warning}>{report?.note ?? ""}</p>
        <div className={styles.chartGrid}><div className={styles.chartCard}><h3>বিক্রি ও খরচের চিত্র</h3><p className={styles.hint}>দিনভিত্তিক বিক্রি ও আয় বনাম ক্রয় ও খরচ</p>{report?.byDay.length ? <div className={styles.barChart}>{report.byDay.map((point) => <div className={styles.barGroup} key={point._id}><div className={styles.bars}><span title={`আয় ${money(point.sales + point.income)}`} style={{ height: `${Math.max(3, (point.sales + point.income) / maxChart * 100)}%` }} /><span className={styles.costBar} title={`ব্যয় ${money(point.costs)}`} style={{ height: `${Math.max(3, point.costs / maxChart * 100)}%` }} /></div><small>{point._id.slice(5)}</small></div>)}</div> : <p className={styles.empty}>এই সময়ে হিসাব নেই।</p>}<div className={styles.legend}><span>আয়</span><span>ব্যয়</span></div></div>
          <div className={styles.chartCard}><h3>খাতভিত্তিক খরচ</h3>{report?.byCategory.length ? <div className={styles.pieLayout}><div className={styles.pieChart} style={pieStyle} role="img" aria-label="খাতভিত্তিক খরচের বণ্টন" /><div className={styles.categoryBars}>{report.byCategory.map((row) => <div key={row._id.name}><div><span>{row._id.name || "অনির্ধারিত"}</span><strong>{money(row.amountPaisa)}</strong></div><progress max={Math.max(...report.byCategory.map((item) => item.amountPaisa), 1)} value={row.amountPaisa} /></div>)}</div></div> : <p className={styles.empty}>এই সময়ে খরচ নেই।</p>}</div>
        </div></section>}

      {tab === "settings" && <section className={styles.mainGrid}><section className={styles.panel}><span className={styles.eyebrow}>খাত ব্যবস্থাপনা</span><h2>আয় বা ব্যয়ের খাত যোগ</h2><form className={styles.inlineForm} onSubmit={createCategory}><input required minLength={2} maxLength={80} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="যেমন: পরিবহন, বেতন" /><select value={categoryForm.type} onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value as "income" | "expense" })}><option value="expense">ব্যয়</option><option value="income">আয়</option></select><button disabled={busy}>খাত যোগ</button></form><div className={styles.chips}>{categories.map((category) => <span key={category._id}>{category.name}<small>{category.type === "expense" ? "ব্যয়" : "আয়"}</small></span>)}</div></section><section className={styles.panel}><span className={styles.eyebrow}>হিসাবের মাধ্যম</span><h2>পেমেন্ট পদ্ধতি</h2><div className={styles.chips}>{methods.map((method) => <span key={method.value}>{method.label}</span>)}</div><p className={styles.hint}>নগদ, বিকাশ, নগদ (Nagad), রকেট, ব্যাংক ও অন্যান্য মাধ্যম আলাদাভাবে হিসাব করা হয়।</p></section></section>}

      {tab === "access" && isAdmin && <section className={styles.panel}><span className={styles.eyebrow}>অনুমতি নিয়ন্ত্রণ</span><h2>হিসাব ব্যবহারের ম্যানেজার</h2><p className={styles.hint}>তালিকায় থাকা বিদ্যমান অ্যাডমিন অ্যাকাউন্টকে হিসাবের ম্যানেজার হিসেবে চালু বা বন্ধ করুন। বন্ধ করলে পরের অনুরোধ থেকেই অ্যাক্সেস বন্ধ হবে।</p><div className={styles.managerList}>{managers.map((manager) => <div key={manager.id} className={styles.manager}><div><strong>{manager.name}</strong><span>{manager.email}</span></div><button className={manager.active ? styles.dangerButton : styles.primaryButton} onClick={() => void toggleManager(manager)}>{manager.active ? "অ্যাক্সেস বন্ধ" : "অ্যাক্সেস দিন"}</button></div>)}</div>{managers.length === 0 && <p className={styles.empty}>অ্যাক্সেস দেওয়ার মতো বিদ্যমান অ্যাডমিন অ্যাকাউন্ট নেই।</p>}</section>}

      <button type="button" className={styles.calculatorToggle} onClick={() => setShowCalculator((value) => !value)} aria-expanded={showCalculator}>⌗ ক্যালকুলেটর</button>
      {showCalculator && <section className={styles.calculator} aria-label="হিসাবের ক্যালকুলেটর"><header><strong>দ্রুত ক্যালকুলেটর</strong><button type="button" onClick={() => setShowCalculator(false)} aria-label="বন্ধ করুন">×</button></header><p className={styles.calculatorHelp}>বন্ধনী, শতাংশ এবং বড় অঙ্ক লিখুন। কিবোর্ডেও হিসাব করা যাবে।</p><output aria-live="polite">{calculator.display}</output>{calculator.error && <p className={styles.calculatorError}>{calculator.error}</p>}<div className={styles.keypad}>{["AC", "(", ")", "⌫", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", "00", ".", "+", "%", "±", "=", "000"].map((key, index) => <button type="button" key={`${key}-${index}`} className={key === "=" ? styles.equalKey : ["÷", "×", "−", "+", "%"].includes(key) ? styles.opKey : ""} aria-label={key === "AC" ? "সব মুছুন" : key} onClick={() => calculatorKey(key === "⌫" ? "Backspace" : key)}>{key}</button>)}</div><p className={styles.calculatorHint}>উদাহরণ: (১২৫০০ + ২৫০০) × ২ = ৩০,০০০</p></section>}
      <footer className={styles.footerNote}>সব লেনদেন পরিবর্তনের অডিটসহ সংরক্ষিত হয়। বাতিল করা হিসাব হারিয়ে যায় না। PDF তৈরির জন্য প্রিন্ট ডায়ালগে “Save as PDF” বেছে নিন।</footer>
    </main>
  );
}

function Metric({ title, value, tone = "" }: { title: string; value: string; tone?: string }) {
  return <article className={`${styles.metric} ${tone ? styles[tone] : ""}`}><span>{title}</span><strong>{value}</strong></article>;
}
