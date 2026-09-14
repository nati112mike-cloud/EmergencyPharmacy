"use client";

import { useCallback, useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";

type User = { id: string; username: string; name: string; role: string; createdAt: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function removeUser(id: string) {
    if (!confirm("Remove this user? They will no longer be able to sign in.")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to remove user");
      return;
    }
    load();
  }

  async function sendTestDigest() {
    setTestSending(true);
    setTestResult("");
    const res = await fetch("/api/notifications/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTestSending(false);
    setTestResult(res.ok ? `Sent to ${data.sentTo}.` : data.error ?? "Failed to send");
  }

  if (forbidden) {
    return (
      <div className="card">
        <p className="text-slate-500">Only admin accounts can manage staff logins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500">Staff accounts that can sign in to this system.</p>
        </div>
        <button className="btn" onClick={() => setShowAdd(true)}>
          + Add User
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="font-mono text-xs">{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === "ADMIN" ? "badge-ok" : "text-slate-500"}`}>{u.role}</span>
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="space-x-3 text-right">
                    <button className="text-sm font-medium text-brand-600" onClick={() => setResetTarget(u)}>
                      Reset Password
                    </button>
                    <button className="text-sm text-red-600" onClick={() => removeUser(u.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="mb-1 font-semibold text-slate-900">Notifications</h2>
        <p className="mb-3 text-sm text-slate-500">
          A digest of overdue/soon-due payments, low stock, and expiring stock is emailed on a
          schedule once SMTP_HOST/SMTP_USER/SMTP_PASSWORD/NOTIFY_EMAIL_TO are set (see README).
          Use this to check it's configured correctly.
        </p>
        <button className="btn-secondary" disabled={testSending} onClick={sendTestDigest}>
          {testSending ? "Sending…" : "Send test digest now"}
        </button>
        {testResult && <p className="mt-2 text-sm text-slate-600">{testResult}</p>}
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to reset password");
      return;
    }
    setSuccess(true);
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Reset Password — {user.name}</h2>
        {success ? (
          <>
            <p className="text-sm text-emerald-700">
              Password reset. Share the new password with {user.name} directly.
            </p>
            <div className="mt-4 flex justify-end">
              <button className="btn" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <PasswordInput placeholder="New password" value={newPassword} onChange={setNewPassword} />
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
              <button className="btn" disabled={submitting || !newPassword || !confirmPassword} onClick={submit}>
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STAFF");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, name, password, role }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create user");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Add User</h2>
        <div className="space-y-3">
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <PasswordInput placeholder="Password (min 6 characters)" value={password} onChange={setPassword} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={submitting || !username || !name || !password} onClick={submit}>
            Save User
          </button>
        </div>
      </div>
    </div>
  );
}
