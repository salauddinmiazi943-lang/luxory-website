"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, ArrowLeft, Home } from "lucide-react";

type Account = { id: string; name: string; email: string; role: string; permissions?: string[] };

function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Expose global nav function for requirement 4 and 7
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { nav: (path: string) => void }).nav = (path: string) => {
        router.push(path);
      };
    }
  }, [router]);

  // Handle unauthorized redirect
  useEffect(() => {
    if (searchParams.get("error") === "unauthorized") {
      const timer = window.setTimeout(() => {
        setError("Access denied. Unauthorized customers and sellers cannot access admin functionality.");
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  // Check existing session: if already logged in as super_admin or admin, redirect to /admin
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ user?: Account | null }>)
      .then((data) => {
        if (!active) return;
        if (data.user && (data.user.role === "super_admin" || data.user.role === "admin")) {
          router.replace("/admin");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const result = await response.json() as { user?: Account; error?: string };

      if (!response.ok || !result.user) {
        throw new Error(result.error || "Invalid administrator credentials.");
      }

      // Role-based authorization: Only super_admin or admin with permissions are authorized
      if (result.user.role !== "super_admin" && result.user.role !== "admin") {
        // Immediately terminate session for unauthorized users
        await fetch("/api/auth/logout", { method: "POST" });
        throw new Error("Access denied. Unauthorized customers and sellers are not permitted in the Admin Portal.");
      }

      window.dispatchEvent(new Event("eshop:auth-changed"));
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  function navigateHome() {
    if (typeof (window as unknown as { nav?: (p: string) => void }).nav === "function") {
      (window as unknown as { nav: (p: string) => void }).nav("/");
    } else {
      router.push("/");
    }
  }

  return (
    <div className="page-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <p className="breadcrumb">
          <Link href="/" onClick={(e) => { e.preventDefault(); navigateHome(); }}>
            Home
          </Link>{" "}
          / Super Admin Portal
        </p>
        <button
          type="button"
          onClick={navigateHome}
          className="button-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px", cursor: "pointer" }}
        >
          <Home size={14} /> Home
        </button>
      </div>

      <div style={{ maxWidth: 500, margin: "20px auto 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Link href="/" onClick={(e) => { e.preventDefault(); navigateHome(); }} className="brand" aria-label="Luxora Global Trade" style={{ justifyContent: "center", display: "inline-flex" }}>
            <img src="/images/luxora-logo.jpg" alt="Luxora Global Trade" className="brand-logo" style={{ height: 44, width: "auto" }} />
          </Link>
          <h1 className="page-title" style={{ marginTop: 16, fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <ShieldCheck size={26} color="var(--primary, #f85606)" /> Super Admin Login
          </h1>
          <p style={{ color: "var(--muted, #757575)", fontSize: 13 }}>
            Protected administrative area. Authenticate with verified credentials to continue.
          </p>
        </div>

        <form className="form-card" onSubmit={handleLogin} style={{ width: "100%", margin: "0 auto" }}>
          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="field">
            <label htmlFor="adminEmail">Super Admin Email</label>
            <input
              id="adminEmail"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@luxoraglobal.com"
              required
              autoComplete="username"
              maxLength={254}
            />
          </div>

          <div className="field">
            <label htmlFor="adminPassword">Password</label>
            <input
              id="adminPassword"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </div>

          <button className="button-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy}>
            {busy ? "Authenticating…" : "Sign In to Admin Panel"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link
            href="/"
            onClick={(e) => { e.preventDefault(); navigateHome(); }}
            style={{ color: "var(--muted, #757575)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <ArrowLeft size={14} /> Return to Storefront Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="page-shell" style={{ padding: 24 }}>Loading…</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
