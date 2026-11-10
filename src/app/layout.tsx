import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteBottomNav } from "@/components/site-bottom-nav";
import { AnnouncementBar } from "@/components/announcement-bar";

export const metadata: Metadata = {
  title: { default: "Luxora Global Trade | Premium Quality Products", template: "%s | Luxora Global Trade" },
  description: "Discover premium quality products at Luxora Global Trade. Committed to faith, honesty, and high-quality products.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <StoreProvider><AnnouncementBar /><SiteHeader /><main className="site-content">{children}</main><SiteFooter /><SiteBottomNav /></StoreProvider>
      </body>
    </html>
  );
}
