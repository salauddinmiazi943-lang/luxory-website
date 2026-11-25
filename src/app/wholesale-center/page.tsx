import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TradeRequestCenter } from "@/components/trade-request-center";

export const dynamic = "force-dynamic";

export default async function WholesaleCenterPage() {
  const access = await requireUser(["wholesaler", "admin", "super_admin"]);
  if ("error" in access) {
    return <div className="page-shell"><h1 className="page-title">Wholesale Center (হোলসেল সেন্টার)</h1><p className="form-error">হোলসেলার লগইন/অনুমোদন প্রয়োজন।</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="button-primary" href="/account">Sign in</Link><Link className="button-secondary" href="/business-application">Apply as Wholesaler</Link></div></div>;
  }
  return <div className="page-shell">
    <p className="breadcrumb"><Link href="/">Home</Link> / Wholesale Center</p>
    <h1 className="page-title">Wholesale Center (হোলসেল সেন্টার)</h1>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <p style={{ margin: 0 }}><strong>হোলসেলারদের জন্য আলাদা ব্যবস্থা:</strong> আপনি ওয়েবসাইট থেকে সাধারণ (নিয়মিত) Checkout/অর্ডার করতে পারবেন না। আপনার প্রয়োজন অনুযায়ী এখানে <strong>অ্যাডমিনের কাছে মেসেজ/অর্ডার অনুরোধ</strong> পাঠিয়ে পণ্যের দাম, পরিমাণ, ভেরিয়েন্ট ও ডেলিভারি আলোচনা করে অর্ডার নিতে পারবেন।</p>
    </div>
    <div className="grid" style={{ gap: 16, marginBottom: 16 }}>
      <section className="card" style={{ padding: 16 }}><h2 style={{ marginTop: 0 }}>Pricing & MOQ (Bulk)</h2><p>পণ্যে Admin কর্তৃক নির্ধারিত <strong>Wholesaler Price</strong> ও <strong>MOQ</strong> প্রযোজ্য (যেখানে সেট আছে)।</p><Link className="button-secondary" href="/products">পণ্য দেখুন</Link></section>
    </div>
    {access.user.role === "wholesaler" ? <TradeRequestCenter role="wholesaler" /> : <p className="subtle">অর্ডার অনুরোধ/মেসেজ পাঠাতে হোলসেলার অ্যাকাউন্ট দিয়ে লগইন করুন।</p>}
  </div>;
}
