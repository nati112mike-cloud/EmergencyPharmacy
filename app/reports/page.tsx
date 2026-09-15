"use client";

import { useEffect, useState } from "react";
import RequireAdmin from "@/components/RequireAdmin";
import ModalBackdrop from "@/components/ModalBackdrop";

type DailyReport = {
  reportDate: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
  totalPurchaseCount: number;
  totalPurchaseCost: number;
  topSellers: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: { productId: string; sku: string; name: string; stock: number; reorderPoint: number }[];
  expiring: {
    batchId: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    daysUntilExpiry: number;
    status: string;
  }[];
  sales: {
    id: string;
    saleDate: string;
    totalAmount: number;
    paymentMethod: string;
    cashierName: string | null;
    itemCount: number;
  }[];
  purchases: {
    id: string;
    supplierName: string;
    status: string;
    itemCount: number;
    totalCost: number;
    createdBy: string | null;
  }[];
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  return (
    <RequireAdmin>
      <ReportsContent />
    </RequireAdmin>
  );
}

function ReportsContent() {
  const [date, setDate] = useState(isoDate(new Date()));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);

  async function generate(d: string) {
    setLoading(true);
    const res = await fetch(`/api/reports/daily?date=${d}`);
    const data = await res.json();
    setReport(data);
    setLoading(false);
  }

  useEffect(() => {
    generate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shiftDay(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    const next = isoDate(d);
    setDate(next);
    generate(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Reports</h1>
          <p className="text-slate-500">Revenue, profit, sales, purchases, and inventory alerts by day.</p>
        </div>
        <a href={`/api/reports/daily/export?date=${date}`} className="btn-secondary">
          Export to Excel
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => shiftDay(-1)}>
          ← Previous Day
        </button>
        <input
          type="date"
          className="input w-auto"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            generate(e.target.value);
          }}
        />
        <button className="btn-secondary" onClick={() => shiftDay(1)}>
          Next Day →
        </button>
      </div>

      {loading || !report ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="card">
              <p className="text-sm text-slate-500">Revenue</p>
              <p className="mt-1 text-xl font-bold">{money(report.totalRevenue)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Cost of Goods</p>
              <p className="mt-1 text-xl font-bold">{money(report.totalCost)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Profit</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{money(report.totalProfit)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Sales</p>
              <p className="mt-1 text-xl font-bold">{report.totalSalesCount}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Purchases</p>
              <p className="mt-1 text-xl font-bold">{report.totalPurchaseCount}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Purchase Cost</p>
              <p className="mt-1 text-xl font-bold">{money(report.totalPurchaseCost)}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card overflow-x-auto p-0">
              <h2 className="p-4 pb-0 font-semibold text-slate-900">Sales Recorded Today</h2>
              {report.sales.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No sales recorded this day.</p>
              ) : (
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Items</th>
                      <th>Method</th>
                      <th>Cashier</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.map((s) => (
                      <tr key={s.id}>
                        <td>{new Date(s.saleDate).toLocaleTimeString()}</td>
                        <td>{s.itemCount}</td>
                        <td>{s.paymentMethod}</td>
                        <td>{s.cashierName ?? "—"}</td>
                        <td>{money(s.totalAmount)}</td>
                        <td className="text-right">
                          <button
                            className="text-sm font-medium text-brand-600"
                            onClick={() => setRefundSaleId(s.id)}
                          >
                            Refund
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card overflow-x-auto p-0">
              <h2 className="p-4 pb-0 font-semibold text-slate-900">Purchases Posted Today</h2>
              {report.purchases.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No purchases posted this day.</p>
              ) : (
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th>Items</th>
                      <th>Cost</th>
                      <th>Posted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.purchases.map((p) => (
                      <tr key={p.id}>
                        <td>{p.supplierName}</td>
                        <td>
                          <span className={`badge ${p.status === "RECEIVED" ? "badge-ok" : "text-slate-500"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>{p.itemCount}</td>
                        <td>{money(p.totalCost)}</td>
                        <td>{p.createdBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-900">Top Sellers</h2>
              {report.topSellers.length === 0 ? (
                <p className="text-sm text-slate-500">No sales this day.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.topSellers.map((s) => (
                    <li key={s.productId} className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="text-slate-500">
                        {s.quantity} · {money(s.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-900">Low Stock</h2>
              {report.lowStock.length === 0 ? (
                <p className="text-sm text-slate-500">All healthy.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.lowStock.map((p) => (
                    <li key={p.productId} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="badge badge-warning">{p.stock} left</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-900">Expiring Stock</h2>
              {report.expiring.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing expiring soon.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.expiring.map((b) => (
                    <li key={b.batchId} className="flex justify-between">
                      <span>{b.productName}</span>
                      <span className={`badge ${b.status === "expired" ? "badge-danger" : "badge-warning"}`}>
                        {b.status === "expired" ? "Expired" : `${b.daysUntilExpiry}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {refundSaleId && (
        <RefundModal
          saleId={refundSaleId}
          onClose={() => setRefundSaleId(null)}
          onDone={() => {
            setRefundSaleId(null);
            generate(date);
          }}
        />
      )}
    </div>
  );
}

type SaleDetail = {
  id: string;
  saleDate: string;
  totalAmount: number;
  items: { id: string; productName: string; quantity: number; unitPrice: number; returnedQuantity: number }[];
};

function RefundModal({
  saleId,
  onClose,
  onDone,
}: {
  saleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/${saleId}`)
      .then((r) => r.json())
      .then(setSale);
  }, [saleId]);

  const selected = sale?.items.find((i) => i.id === itemId);
  const returnable = selected ? selected.quantity - selected.returnedQuantity : 0;

  async function submit() {
    if (!itemId) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/sale-items/${itemId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: Number(quantity), reason: reason || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to process return");
      return;
    }
    onDone();
  }

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md">
      <h2 className="mb-4 text-lg font-semibold">Refund a line item</h2>
        {!sale ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select item…</option>
              {sale.items.map((i) => {
                const left = i.quantity - i.returnedQuantity;
                return (
                  <option key={i.id} value={i.id} disabled={left <= 0}>
                    {i.productName} — {i.quantity} sold
                    {i.returnedQuantity > 0 ? `, ${i.returnedQuantity} already returned` : ""}
                    {left <= 0 ? " (fully returned)" : ""}
                  </option>
                );
              })}
            </select>
            {selected && (
              <>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={returnable}
                  placeholder={`Quantity (up to ${returnable})`}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-sm text-slate-500">
                  Refund amount: ${(Number(quantity || 0) * selected.unitPrice).toFixed(2)}. Stock is
                  restored to its original batch if that batch still exists.
                </p>
              </>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={
              submitting || !itemId || !quantity || Number(quantity) <= 0 || Number(quantity) > returnable
            }
            onClick={submit}
          >
            {submitting ? "Processing…" : "Process Refund"}
          </button>
        </div>
    </ModalBackdrop>
  );
}
