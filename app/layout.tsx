import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

// A rounded, friendly wordmark font for the "Meaza Pharmacy" logotype —
// distinct from the app's UI font so the brand reads as a logo, not a label.
const logoFont = Baloo_2({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-logo",
});

// Together with app/manifest.ts and app/icon.tsx/apple-icon.tsx, this is what
// makes "Add to Home Screen" work well: a real icon, a standalone (no
// browser chrome) window, and the right iOS-specific meta tags.
export const metadata: Metadata = {
  title: "Meaza Pharmacy — Business Assistant",
  description: "Inventory, POS, suppliers and growth analytics for Meaza Pharmacy.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Meaza Pharmacy",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={logoFont.variable}>
      <body>
        <NavBar />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
