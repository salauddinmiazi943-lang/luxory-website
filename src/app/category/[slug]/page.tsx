import { ProductListing } from "@/components/product-listing";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  return <ProductListing categorySlug={(await params).slug} />;
}
