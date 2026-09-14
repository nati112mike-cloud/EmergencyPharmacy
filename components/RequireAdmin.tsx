"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type CurrentUser = { id: string; username: string; name: string; role: string };

/** undefined = still loading, null = not signed in. */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  return user;
}

/**
 * Client-side guard for admin-only pages (Inventory, Payments, Reports,
 * Dashboard). Redirects STAFF to /pos. This is a UX guard, not the security
 * boundary — the underlying API routes enforce the real restriction via
 * requireAdmin(), since a client redirect alone can't stop a direct API call.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "ADMIN") router.replace("/pos");
  }, [user, router]);

  if (user === undefined) return <p className="text-slate-500">Loading…</p>;
  if (!user || user.role !== "ADMIN") return null;
  return <>{children}</>;
}
