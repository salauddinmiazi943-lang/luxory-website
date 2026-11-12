"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store-context";

type Account = { name: string; email: string; role: string; permissions?: string[] };
export function AccountPage() {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [wallet, setWallet] = useState<{ wallet: { balanceCoins: number; totalEarnedCoins: number; totalRedeemedCoins: number }; transactions: { _id: string; amount: number; type: string; description?: string; createdAt?: string }[] } | null>(null);
  const [vouchers, setVouchers] = useState<{ _id: string; voucherCode: string; amount: number; minOrderAmount: number; expiresAt: string; status: string; usedAt?: string }[] | null>(null);
  const router = useRouter();
  const { t } = useStore();
  useEffect(() => {
    fetch("/api/auth/me").then((response) => response.json() as Promise<{ user: Account | null }>).then((result) => {
      setAccount(result.user);
      if (result.user && ["customer","reseller","wholesaler"].includes(result.user.role)) {
        fetch("/api/customer/wallet").then((r) => r.ok ? r.json() : null).then((w) => { if (w) setWallet(w as any); }).catch(() => {});
        fetch("/api/customer/vouchers").then((r) => r.ok ? r.json() : null).then((v: any) => { if (v?.vouchers) setVouchers(v.vouchers); }).catch(() => {});
      }
    }).catch((reason: unknown) => console.error(reason));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(register ? { name: data.get("name") } : {}), email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json() as { user?: Account; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Could not sign in");
      setAccount(result.user);
      window.dispatchEvent(new Event("eshop:auth-changed"));
      if (result.user.role === "delivery_staff") router.push("/delivery");
      else if (result.user.role === "vendor") router.push("/vendor");
      else if (result.user.role === "admin" || result.user.role === "super_admin") router.push("/admin");
      else router.push("/orders");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally { setBusy(false); }
  }
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Please try again."); return; }
    setAccount(null);
    window.dispatchEvent(new Event("eshop:auth-changed"));
  }
  if (account) return <div className="page-shell"><h1 className="page-title">Welcome, {account.name}</h1><p>{account.email}</p><p className="subtle">Role: {account.role}</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="button-primary" href={account.role === "delivery_staff" ? "/delivery" : account.role === "vendor" ? "/vendor" : account.role === "admin" || account.role === "super_admin" ? "/admin" : "/orders"}>{account.role === "delivery_staff" ? "Delivery dashboard" : account.role === "vendor" ? t("vendorDashboard") : account.role === "admin" || account.role === "super_admin" ? t("adminDashboard") : t("myOrders")}</Link>{account.role === "reseller" && <Link className="button-secondary" href="/reseller-center">Reseller Center</Link>}{account.role === "wholesaler" && <Link className="button-secondary" href="/wholesale-center">Wholesale Center</Link>}<button className="button-secondary" onClick={logout}>Sign out</button></div>{error && <p className="form-error">{error}</p>}{wallet && <section className="card" style={{ marginTop: 16, maxWidth: 720 }}><h2>Coin Wallet</h2><p><strong>Balance:</strong> {wallet.wallet.balanceCoins} coins</p><p className="subtle">Total earned: {wallet.wallet.totalEarnedCoins} · Total redeemed: {wallet.wallet.totalRedeemedCoins}</p><h3 style={{ marginTop: 12 }}>Recent transactions</h3>{wallet.transactions.length === 0 ? <p className="subtle">No transactions yet.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{wallet.transactions.slice(0, 20).map((tx) => <li key={tx._id}><strong>{tx.amount > 0 ? "+" : ""}{tx.amount}</strong> {tx.type}{tx.description ? ` — ${tx.description}` : ""}</li>)}</ul>}</section>}{vouchers && <section className="card" style={{ marginTop: 16, maxWidth: 720 }}><h2>My Vouchers / Rewards</h2>{vouchers.length === 0 ? <p className="subtle">No vouchers yet.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{vouchers.map((v) => <li key={v._id} style={{ marginBottom: 8 }}><strong>{v.voucherCode}</strong> — ৳{Number(v.amount).toLocaleString("en-BD")} (min order ৳{Number(v.minOrderAmount).toLocaleString("en-BD")}) · <em>{v.status}</em> · Expires: {new Date(v.expiresAt).toLocaleDateString()}{v.usedAt ? ` · Used: ${new Date(v.usedAt).toLocaleDateString()}` : ""}</li>)}</ul>}</section>}</div>;
  return <div className="page-shell"><p className="breadcrumb"><Link href="/">{t("home")}</Link>　/　{t("account")}</p><h1 className="page-title">{register ? t("createAccount") : t("welcomeBack")}</h1><form className="form-card" onSubmit={submit}>
    {error && <p className="form-error">{error}</p>}
    {register && <div className="field"><label htmlFor="name">{t("fullName")}</label><input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120} /></div>}
    <div className="field"><label htmlFor="email">{t("emailAddressLabel")}</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
    <div className="field"><label htmlFor="password">{t("password")}</label><input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 10 : 1} maxLength={128} />{register && <small className="subtle">{t("useTenCharacters")}</small>}</div>
    <button className="button-primary" disabled={busy}>{busy ? "Please wait…" : register ? t("createAccount") : t("signIn")}</button>
    <p className="subtle">{register ? t("alreadyAccount") : t("newAccount")} <button type="button" className="inline-button" onClick={() => { setError(""); setRegister(!register); }}>{register ? t("signIn") : t("createAccount")}</button></p>
  </form></div>;
}
