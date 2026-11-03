import { Suspense } from "react";
import { ProductListing } from "@/components/product-listing";

export default function ProductsPage() {
  return <Suspense fallback={<div className="page-shell">Loading products…</div>}><ProductListing /></Suspense>;
}
