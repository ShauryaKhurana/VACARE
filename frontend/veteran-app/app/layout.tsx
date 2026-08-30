import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/providers";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "VA CARE",
  description:
    "A free guide to help you file your VA claim, working with a real accredited Veteran Service Officer.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VA CARE",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2b6e63",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      {/* h-full + overflow-hidden, not min-h-full: this app manages scrolling
          itself, per-screen (ChatThread's message list, PageContainer's
          content column) -- without a hard ceiling here, nothing stops a
          tall screen's content from growing the whole document past the
          viewport and falling back to browser-level page scroll, which
          drags the input bar down and out of frame with it. */}
      <body className="h-full flex flex-col overflow-hidden bg-background text-text-primary">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
