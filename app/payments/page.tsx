"use client";

import { useCallback, useEffect, useState } from "react";

type UpcomingPayment = {
  id: string;
  kind: "PURCHASE_ORDER" | "BILL";
  title: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  urgency: "overdue" | "due_soon" | "upcoming";
  billType?: string;
  supplierName?: string;
};

type Supplier = { id: string; name: string };

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function urgencyBadge(u: UpcomingPayment["urgency"], daysUntilDue: number) {
  if (u === "overdue") return <span className="badge badge-danger">Overdue {Math.abs(daysUntilDue)}d</span>;
  if (u === "due_soon") return <span className="badge badge-warning">Due in {daysUntilDue}d</span>;
  return <span className="badge text-slate-500">Due in {daysUntilDue}d</span>;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddBill, setShowAddBill] = useState(false);
  const [showUploadInvoice, setShowUploadInvoice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([
      fetch("/api/payments/upcoming").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
    ]);
    setPayments(p);
    setSuppliers(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid(p: UpcomingPayment) {
    const endpoint = p.kind === "BILL" ? `/api/bills/${p.id}/pay` : `/api/purchase-orders/${p.id}/pay`;
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    load();
  }

  const overdue = payments.filter((p) => p.urgency === "overdue");
  const dueSoon = payments.filter((p) => p.urgency === "due_soon");
  const totalDue = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-slate-500">
            Credit purchases, rent, and salary — one place to see what's coming due.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowUploadInvoice(true)}>
            Upload Invoice
          </button>
          <button className="btn" onClick={() => setShowAddBill(true)}>
            + Add Bill
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Overdue</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{overdue.length}</p>
          <p className="text-sm text-slate-500">{money(overdue.reduce((s, p) => s + p.amount, 0))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Due within 7 days</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{dueSoon.length}</p>
          <p className="text-sm text-slate-500">{money(dueSoon.reduce((s, p) => s + p.amount, 0))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Total unpaid</p>
          <p className="mt-1 text-2xl font-bold">{money(totalDue)}</p>
          <p className="text-sm text-slate-500">{payments.length} payment(s)</p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Due Date</th>
                <th>Status</th>
                <th>Description</th>
                <th>Type</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={`${p.kind}-${p.id}`}>
                  <td>{new Date(p.dueDate).toLocaleDateString()}</td>
                  <td>{urgencyBadge(p.urgency, p.daysUntilDue)}</td>
                  <td>{p.title}</td>
                  <td>{p.kind === "PURCHASE_ORDER" ? "Supplier credit" : p.billType}</td>
                  <td>{money(p.amount)}</td>
                  <td className="text-right">
                    <button className="text-sm font-medium text-brand-600" onClick={() => markPaid(p)}>
                      Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Nothing unpaid right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddBill && (
        <AddBillModal
          onClose={() => setShowAddBill(false)}
          onCreated={() => {
            setShowAddBill(false);
            load();
          }}
        />
      )}

      {showUploadInvoice && (
        <UploadInvoiceModal
          suppliers={suppliers}
          onClose={() => setShowUploadInvoice(false)}
          onCreated={() => {
            setShowUploadInvoice(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddBillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState("RENT");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState("MONTHLY");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        amount,
        dueDate,
        notes: notes || undefined,
        isRecurring,
        recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Add Bill</h2>
        <div className="space-y-3">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="RENT">Rent</option>
            <option value="SALARY">Salary</option>
            <option value="OTHER">Other</option>
          </select>
          <input className="input" placeholder="Title (e.g. Store Rent - September)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Recurring — automatically schedule the next one when this is paid
          </label>
          {isRecurring && (
            <select className="input" value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value)}>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          )}
          <textarea className="input" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={submitting || !title || !amount || !dueDate} onClick={submit}>
            Save Bill
          </button>
        </div>
      </div>
    </div>
  );
}

type ParsedItem = { description: string; quantity: number; unitCost: number };

function UploadInvoiceModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const [fileKey, setFileKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/invoices/parse", { method: "POST", body: formData });
    setUploading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to process invoice");
      return;
    }
    setFileKey(data.fileKey);
    setFileName(data.fileName);
    setItems(data.lineItems.length > 0 ? data.lineItems : [{ description: "", quantity: 1, unitCost: 0 }]);
    setSupplierId(data.detectedSupplierId ?? "");
    setNote(data.note ?? "");
    setStep("review");
  }

  function updateItem(idx: number, patch: Partial<ParsedItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  async function confirm() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/invoices/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, dueDate, items, fileKey, fileName }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create purchase order");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-2 text-lg font-semibold">Upload Purchase Invoice</h2>

        {step === "upload" && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Upload a supplier invoice (PDF or image). For PDFs, line items are detected
              automatically — you'll review and correct them before anything is saved. For
              photographed/scanned images, you'll enter items manually and the file stays
              attached for reference.
            </p>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" disabled={!file || uploading} onClick={upload}>
                {uploading ? "Processing…" : "Upload & Detect Items"}
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            {note && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">{note}</p>}
            <p className="mb-3 text-sm text-slate-500">
              Review the detected items below — fix anything wrong before creating the purchase
              order. Nothing is saved until you confirm.
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-1 text-left">Description</th>
                  <th className="py-1 text-left">Qty</th>
                  <th className="py-1 text-left">Unit Cost</th>
                  <th className="py-1 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-1 pr-2">
                      <input
                        className="input"
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input w-20"
                        type="number"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="input w-24"
                        type="number"
                        step="0.01"
                        value={it.unitCost}
                        onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1">
                      <button className="text-sm text-red-600" onClick={() => removeItem(idx)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="mt-2 text-sm font-medium text-brand-600"
              onClick={() => setItems((prev) => [...prev, { description: "", quantity: 1, unitCost: 0 }])}
            >
              + Add line
            </button>

            <p className="mt-3 text-right text-sm font-medium">Total: ${total.toFixed(2)}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Payment due date (enter manually from the invoice)
                </label>
                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={submitting || !supplierId || !dueDate || items.length === 0}
                onClick={confirm}
              >
                {submitting ? "Creating…" : "Create Purchase Order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
