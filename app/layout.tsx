import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Meaza Pharmacy — Business Assistant",
  description: "Inventory, POS, suppliers and growth analytics for Meaza Pharmacy.",
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
