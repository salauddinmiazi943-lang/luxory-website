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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router-এ root layout-এর <head> সব page-এ প্রযোজ্য, তাই এই rule এখানে false positive */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <StoreProvider><AnnouncementBar /><SiteHeader /><main className="site-content">{children}</main><SiteFooter /><SiteBottomNav /></StoreProvider>
      </body>
    </html>
  );
}
