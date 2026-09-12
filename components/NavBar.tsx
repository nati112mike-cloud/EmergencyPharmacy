"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/pos", label: "POS" },
  { href: "/inventory", label: "Inventory" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/payments", label: "Payments" },
  { href: "/reports", label: "Reports" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-white">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M10.5 2h3a1 1 0 0 1 1 1v6.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-6.5H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6.5V3a1 1 0 0 1 1-1Z" />
            </svg>
          </span>
          <span className="font-logo text-xl font-bold tracking-tight text-blue-700">
            Meaza Pharmacy
          </span>
        </div>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
