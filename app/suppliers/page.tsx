"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/RequireAdmin";
import ModalBackdrop from "@/components/ModalBackdrop";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  _count: { products: number; purchaseOrders: number };
};

type ReorderSuggestion = {
  productId: string;
  sku: string;
  name: string;
  stock: number;
  reorderPoint: number;
  reorderQty: number;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  lastCostPrice: number;
};

type PurchaseOrder = {
  id: string;
  status: string;
  orderDate: string;
  dueDate: string | null;
  paymentStatus: string;
  invoiceFileName: string | null;
  invoiceFilePath: string | null;
  supplier: { name: string };
  items: { id: string; quantity: number; unitCost: number; product: { name: string } }[];
};

export default function SuppliersPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [s, r, o] = await Promise.all([
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/reorder-suggestions").then((r) => r.json()),
      fetch("/api/purchase-orders").then((r) => r.json()),
    ]);
    setSuppliers(s);
    setSuggestions(r);
    setOrders(o);
    setUnitCosts((prev) => {
      const next = { ...prev };
      for (const s2 of r as ReorderSuggestion[]) {
        if (!(s2.productId in next)) next[s2.productId] = s2.lastCostPrice.toFixed(2);
      }
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPoFromSuggestion(s: ReorderSuggestion) {
    if (!s.defaultSupplierId) {
      alert(`${s.name} has no default supplier set. Edit the product to assign one first.`);
      return;
    }
    const unitCost = Number(unitCosts[s.productId] ?? s.lastCostPrice);
    const product = { productId: s.productId, quantity: s.reorderQty, unitCost };
    await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: s.defaultSupplierId, items: [product] }),
    });
    load();
  }

  async function receivePo(id: string) {
    await fetch(`/api/purchase-orders/${id}/receive`, { method: "POST" });
    load();
  }

  async function payPo(id: string) {
    await fetch(`/api/purchase-orders/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAdmin ? "Suppliers & Purchase Orders" : "Purchase Orders"}
          </h1>
          <p className="text-slate-500">
            {isAdmin
              ? "Manage vendors and act on reorder suggestions."
              : "Post a purchase order and mark it received when the stock arrives."}
          </p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => setShowAddSupplier(true)}>
            + Add Supplier
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="card">
            <h2 className="mb-3 font-semibold text-slate-900">Reorder Suggestions</h2>
            {suggestions.length === 0 ? (
              <p className="text-sm text-slate-500">Stock levels are healthy — nothing to reorder.</p>
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Stock</th>
                    <th>Reorder Point</th>
                    <th>Suggested Qty</th>
                    <th>Unit Cost</th>
                    <th>Default Supplier</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.productId}>
                      <td>{s.name}</td>
                      <td>{s.stock}</td>
                      <td>{s.reorderPoint}</td>
                      <td>{s.reorderQty}</td>
                      <td>
                        <input
                          className="input w-24"
                          type="number"
                          step="0.01"
                          min="0"
                          value={unitCosts[s.productId] ?? ""}
                          onChange={(e) =>
                            setUnitCosts((prev) => ({ ...prev, [s.productId]: e.target.value }))
                          }
                        />
                      </td>
                      <td>{s.defaultSupplierName ?? <span className="text-slate-400">none set</span>}</td>
                      <td className="text-right">
                        <button className="text-sm font-medium text-brand-600" onClick={() => createPoFromSuggestion(s)}>
                          Create PO
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold text-slate-900">Purchase Orders</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">No purchase orders yet.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{o.supplier.name}</span>{" "}
                        <span className="text-slate-400">· {new Date(o.orderDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            o.status === "RECEIVED"
                              ? "badge-ok"
                              : o.status === "ORDERED"
                              ? "badge-warning"
                              : "text-slate-500"
                          }`}
                        >
                          {o.status}
                        </span>
                        {o.status !== "RECEIVED" && (
                          <button className="text-sm font-medium text-brand-600" onClick={() => receivePo(o.id)}>
                            Mark Received
                          </button>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 text-sm text-slate-600">
                      {o.items.map((i) => (
                        <li key={i.id}>
                          {i.quantity} × {i.product.name} @ ${i.unitCost.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                    {isAdmin && o.dueDate && (
                      <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-sm">
                        <span className={`badge ${o.paymentStatus === "PAID" ? "badge-ok" : "badge-warning"}`}>
                          {o.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
                        </span>
                        <span className="text-slate-500">
                          Due {new Date(o.dueDate).toLocaleDateString()}
                        </span>
                        {o.invoiceFilePath && (
                          <a
                            href={`/api/invoices/file/${o.invoiceFilePath}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-600"
                          >
                            View invoice
                          </a>
                        )}
                        {o.paymentStatus !== "PAID" && (
                          <button className="font-medium text-brand-600" onClick={() => payPo(o.id)}>
                            Mark Paid
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-900">Suppliers</h2>
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Products</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.name}</td>
                      <td>{s.contactName ?? "—"}</td>
                      <td>{s.phone ?? "—"}</td>
                      <td>{s.email ?? "—"}</td>
                      <td>{s._count.products}</td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        No suppliers yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAddSupplier && (
        <AddSupplierModal
          onClose={() => setShowAddSupplier(false)}
          onCreated={() => {
            setShowAddSupplier(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddSupplierModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contactName, phone, email }),
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md">
      <h2 className="mb-4 text-lg font-semibold">Add Supplier</h2>
      <div className="space-y-3">
        <input className="input" placeholder="Supplier name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" disabled={submitting || !name} onClick={submit}>
          Save Supplier
        </button>
      </div>
    </ModalBackdrop>
  );
}
