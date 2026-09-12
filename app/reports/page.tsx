"use client";

import { useEffect, useState } from "react";

type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
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
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate(ws: string) {
    setLoading(true);
    const res = await fetch(`/api/reports/weekly?weekStart=${ws}`);
    const data = await res.json();
    setReport(data);
    setLoading(false);
  }

  useEffect(() => {
    generate(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shiftWeek(days: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + days);
    const ws = mondayOf(d);
    setWeekStart(ws);
    generate(ws);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Weekly Reports</h1>
        <p className="text-slate-500">Revenue, profit, best sellers, and inventory alerts by week.</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-secondary" onClick={() => shiftWeek(-7)}>
          ← Previous Week
        </button>
        <span className="font-medium">
          {report ? `${new Date(report.weekStart).toLocaleDateString()} – ${new Date(
            new Date(report.weekEnd).getTime() - 86400000
          ).toLocaleDateString()}` : "Loading…"}
        </span>
        <button className="btn-secondary" onClick={() => shiftWeek(7)}>
          Next Week →
        </button>
      </div>

      {loading || !report ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="card">
              <h2 className="mb-3 font-semibold text-slate-900">Top Sellers</h2>
              {report.topSellers.length === 0 ? (
                <p className="text-sm text-slate-500">No sales this week.</p>
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
    </div>
  );
}
