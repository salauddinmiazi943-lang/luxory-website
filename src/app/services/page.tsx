import type { Metadata } from "next";
import { ServicesPage } from "@/components/services-page";

export const metadata: Metadata = { title: "Services" };

export default function ServicesRoute() {
  return <ServicesPage />;
}
