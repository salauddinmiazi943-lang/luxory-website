import { ProductDetail } from "@/components/product-detail";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return <ProductDetail slug={(await params).slug} />;
}
