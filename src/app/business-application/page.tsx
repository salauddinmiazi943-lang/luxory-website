import { BusinessApplicationForm } from "@/components/business-application-form";

export const metadata = { title: "Reseller & Wholesaler Application" };
export default function BusinessApplicationPage() {
  return <div className="page-shell"><p className="breadcrumb">Home / Reseller & Wholesaler</p><h1 className="page-title">Apply as Reseller or Wholesaler</h1><p className="subtle" style={{ marginBottom: 25 }}>Submit your business information. Admin approval is required before reseller/wholesaler access is activated.</p><BusinessApplicationForm /></div>;
}
