import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResellerCenterPage() {
  const access = await requireUser(["reseller", "admin", "super_admin"]);
  if ("error" in access) {
    return <div className="page-shell"><h1 className="page-title">Reseller Center</h1><p className="form-error">Reseller login/approval required.</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="button-primary" href="/account">Sign in</Link><Link className="button-secondary" href="/business-application">Apply as Reseller</Link></div></div>;
  }
  return <div className="page-shell">
    <p className="breadcrumb"><Link href="/">Home</Link> / Reseller Center</p>
    <h1 className="page-title">Reseller Center</h1>
    <p className="subtle" style={{ marginBottom: 18 }}>আপনার রিসেলার অ্যাকাউন্ট সক্রিয় থাকলে এখানে বিশেষ সুবিধা ও নির্দেশনা দেখবেন।</p>
    <div className="grid" style={{ gap: 16 }}>
      <section className="card" style={{ padding: 16 }}><h2 style={{ marginTop: 0 }}>Pricing & MOQ</h2><p>পণ্যে Admin কর্তৃক নির্ধারিত <strong>Reseller Price</strong> ও <strong>Minimum Order Quantity (MOQ)</strong> প্রযোজ্য হবে (যেখানে সেট করা আছে)। সার্ভার-সাইডে সঠিক দাম ও MOQ যাচাই করা হয়।</p></section>
      <section className="card" style={{ padding: 16 }}><h2 style={{ marginTop: 0 }}>Orders</h2><p>আপনার অর্ডার ও স্ট্যাটাস দেখতে পারবেন।</p><Link className="button-primary" href="/orders">My Orders</Link></section>
      <section className="card" style={{ padding: 16 }}><h2 style={{ marginTop: 0 }}>Shopping</h2><p>পণ্য ব্রাউজ করুন এবং অনুমোদিত রিসেলার হিসেবে অর্ডার করুন।</p><Link className="button-secondary" href="/products">Browse Products</Link></section>
      <section className="card" style={{ padding: 16 }}><h2 style={{ marginTop: 0 }}>Support</h2><p>সহায়তা প্রয়োজন হলে যোগাযোগ করুন বা আবেদন/অ্যাকাউন্ট স্ট্যাটাস যাচাই করুন।</p><Link className="button-secondary" href="/contact">Contact</Link></section>
    </div>
  </div>;
}
