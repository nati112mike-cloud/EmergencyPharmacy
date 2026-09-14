"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }
    const redirect = searchParams.get("redirect") || "/";
    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M10.5 2h3a1 1 0 0 1 1 1v6.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-6.5H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6.5V3a1 1 0 0 1 1-1Z" />
            </svg>
          </span>
          <span className="font-logo text-2xl font-bold tracking-tight text-blue-700">
            Meaza Pharmacy
          </span>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <PasswordInput placeholder="Password" value={password} onChange={setPassword} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn w-full" type="submit" disabled={submitting || !username || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-700"
          onClick={() => setShowForgot((v) => !v)}
        >
          Forgot password?
        </button>
        {showForgot && (
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Ask your pharmacy admin to reset it for you from the Users page — passwords aren't
            recoverable automatically since this system doesn't send reset emails.
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
