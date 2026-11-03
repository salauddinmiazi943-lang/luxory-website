import { VendorApplicationForm } from "@/components/vendor-application-form";

export const metadata = { title: "Become a vendor" };
export default function VendorApplicationPage() {
  return <div className="page-shell"><p className="breadcrumb">Home　/　Become a vendor</p><h1 className="page-title">Let’s grow together.</h1><p className="subtle" style={{ marginBottom: 25 }}>Tell us about your business and our team will review your application.</p><VendorApplicationForm /></div>;
}
