import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession, requireUser } from "@/lib/auth";
import { AccountsDashboard } from "@/components/accounts/accounts-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "হিসাব-নিকাশ",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const current = await requireUser(["super_admin", "admin"]);
  if ("error" in current) {
    if (current.error?.status === 401) redirect("/admin/login");
    if (current.error?.status === 403 || current.error?.status === 404) notFound();
    return <main className="page-shell"><p>সেশন যাচাই করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।</p></main>;
  }
  return <AccountsDashboard />;
}
