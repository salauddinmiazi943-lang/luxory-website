import type { Metadata } from "next";
import { requireAccountsPage } from "@/lib/accounts/access";
import { ExactHisab } from "@/components/accounts/exact-hisab";

export const metadata: Metadata = {
  title: "ব্যবসার হিসাব-নিকাশ",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccountsPage() {
  await requireAccountsPage();
  return <ExactHisab />;
}
