import { ContactForm } from "@/components/contact-form";

export const metadata = { title: "Contact us" };
export default function ContactPage() {
  return <div className="page-shell"><p className="breadcrumb">Home　/　Contact</p><h1 className="page-title">We’d love to hear from you.</h1><p className="subtle" style={{ marginBottom: 25 }}>Questions, feedback, or just want to say hello? Send us a message.</p><ContactForm /></div>;
}
