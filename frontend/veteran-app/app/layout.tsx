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
  title: "Veteran App",
  description:
    "A free guide to help you file your VA claim, working with a real accredited Veteran Service Officer.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Veteran App",
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
      <body className="min-h-full flex flex-col bg-background text-text-primary">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
