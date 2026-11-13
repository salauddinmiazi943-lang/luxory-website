import type { Metadata } from "next";
import { requireAccountsPage } from "@/lib/accounts/access";
import { AccountsDashboard } from "@/components/accounts/dashboard";

export const metadata: Metadata = {
  title: "ব্যবসার হিসাব-নিকাশ",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccountsPage() {
  const user = await requireAccountsPage();
  return <AccountsDashboard isAdmin={user.accountsAdmin} />;
}
