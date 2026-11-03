import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: { default: "eshop. | Everyday tech, thoughtfully selected", template: "%s | eshop." },
  description: "Discover thoughtfully selected electronics, everyday essentials and the latest technology at eshop.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <StoreProvider><SiteHeader /><main className="site-content">{children}</main><SiteFooter /></StoreProvider>
      </body>
    </html>
  );
}
