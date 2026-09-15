"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import ModalBackdrop from "@/components/ModalBackdrop";
import { APP_VERSION, CHANGELOG } from "@/lib/changelog";

// STAFF only gets POS and Purchase Orders (posting a sale / posting a
// purchase) — everything else is admin-only, both here (hidden nav) and in
// the underlying API routes (the real enforcement).
const ADMIN_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/pos", label: "POS" },
  { href: "/inventory", label: "Inventory" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/payments", label: "Payments" },
  { href: "/finance", label: "Finance" },
  { href: "/reports", label: "Reports" },
];
const STAFF_LINKS = [
  { href: "/pos", label: "POS" },
  { href: "/suppliers", label: "Purchase" },
];

type CurrentUser = { id: string; username: string; name: string; role: string };

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, [pathname]);

  if (pathname === "/login") return null;

  const links = user?.role === "ADMIN" ? ADMIN_LINKS : STAFF_LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

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
        <nav className="flex items-center gap-1">
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
          {user?.role === "ADMIN" && (
            <Link
              href="/users"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname === "/users" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Users
            </Link>
          )}

          {user && (
            <div className="relative ml-2">
              <button
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {user.name} ▾
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-md">
                  <button
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowChangePassword(true);
                    }}
                  >
                    Change Password
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowWhatsNew(true);
                    }}
                  >
                    What&apos;s New (v{APP_VERSION})
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-slate-50"
                    onClick={logout}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
    </header>
  );
}

function WhatsNewModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md" className="max-h-[80vh] overflow-y-auto" zIndex="z-30">
      <h2 className="mb-4 text-lg font-semibold">What&apos;s New</h2>
      <div className="space-y-4">
        {CHANGELOG.map((entry) => (
          <div key={entry.version}>
            <p className="text-sm font-semibold text-slate-900">
              v{entry.version} <span className="font-normal text-slate-400">· {entry.date}</span>
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {entry.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalBackdrop>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to change password");
      return;
    }
    setSuccess(true);
  }

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-sm" zIndex="z-30">
      <h2 className="mb-4 text-lg font-semibold">Change Password</h2>
        {success ? (
          <>
            <p className="text-sm text-emerald-700">Password changed successfully.</p>
            <div className="mt-4 flex justify-end">
              <button className="btn" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <PasswordInput
                placeholder="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
              <PasswordInput
                placeholder="New password"
                value={newPassword}
                onChange={setNewPassword}
              />
              <PasswordInput
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
                onClick={submit}
              >
                Save
              </button>
            </div>
          </>
        )}
    </ModalBackdrop>
  );
}
