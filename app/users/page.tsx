"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; username: string; name: string; role: string; createdAt: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

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
                  <td className="text-right">
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

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
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
          <input
            className="input"
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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
