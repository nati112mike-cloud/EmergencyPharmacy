"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DashboardData = {
  todaySalesCount: number;
  todayRevenue: number;
  weekRevenue: number;
  weekProfit: number;
  lowStockCount: number;
  expiringCount: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  lowStock: { productId: string; sku: string; name: string; stock: number; reorderPoint: number }[];
  expiring: {
    batchId: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    daysUntilExpiry: number;
    status: string;
  }[];
  overduePaymentsCount: number;
  overduePaymentsAmount: number;
  dueSoonPaymentsCount: number;
  dueSoonPaymentsAmount: number;
  upcomingPayments: {
    id: string;
    kind: "PURCHASE_ORDER" | "BILL";
    title: string;
    amount: number;
    daysUntilDue: number;
    urgency: "overdue" | "due_soon" | "upcoming";
  }[];
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return <p className="text-slate-500">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Today's snapshot and this week's growth signals.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="card">
          <p className="text-sm text-slate-500">Today's Sales</p>
          <p className="mt-1 text-2xl font-bold">{data.todaySalesCount}</p>
          <p className="text-sm text-slate-500">{money(data.todayRevenue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">This Week's Revenue</p>
          <p className="mt-1 text-2xl font-bold">{money(data.weekRevenue)}</p>
          <p className="text-sm text-emerald-600">Profit {money(data.weekProfit)}</p>
        </div>
        <Link href="/inventory" className="card block transition hover:shadow-md">
          <p className="text-sm text-slate-500">Low Stock Items</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{data.lowStockCount}</p>
          <p className="text-sm text-slate-500">Need reordering</p>
        </Link>
        <Link href="/inventory" className="card block transition hover:shadow-md">
          <p className="text-sm text-slate-500">Expiring Soon</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{data.expiringCount}</p>
          <p className="text-sm text-slate-500">Within 90 days</p>
        </Link>
        <Link href="/payments" className="card block transition hover:shadow-md">
          <p className="text-sm text-slate-500">Payments Overdue</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{data.overduePaymentsCount}</p>
          <p className="text-sm text-slate-500">{money(data.overduePaymentsAmount)}</p>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card md:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-900">Top Sellers This Week</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-slate-500">No sales recorded this week yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-slate-500">
                    {p.quantity} sold · {money(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card md:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-900">Reorder Alerts</h2>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">All stock levels are healthy.</p>
          ) : (
            <ul className="space-y-2">
              {data.lowStock.map((p) => (
                <li key={p.productId} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="badge badge-warning">{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/suppliers" className="mt-3 inline-block text-sm font-medium text-brand-600">
            Go to reordering →
          </Link>
        </div>

        <div className="card md:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-900">Expiry Watch</h2>
          {data.expiring.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing expiring soon.</p>
          ) : (
            <ul className="space-y-2">
              {data.expiring.map((b) => (
                <li key={b.batchId} className="flex items-center justify-between text-sm">
                  <span>
                    {b.productName} <span className="text-slate-400">({b.batchNumber})</span>
                  </span>
                  <span className={`badge ${b.status === "expired" ? "badge-danger" : "badge-warning"}`}>
                    {b.status === "expired" ? "Expired" : `${b.daysUntilExpiry}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/inventory" className="mt-3 inline-block text-sm font-medium text-brand-600">
            View inventory →
          </Link>
        </div>

        <div className="card md:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-900">Payments Due</h2>
          {data.upcomingPayments.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing due — you're all caught up.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcomingPayments.map((p) => (
                <li key={`${p.kind}-${p.id}`} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{p.title}</span>
                  <span
                    className={`badge ${
                      p.urgency === "overdue"
                        ? "badge-danger"
                        : p.urgency === "due_soon"
                        ? "badge-warning"
                        : "text-slate-500"
                    }`}
                  >
                    {p.urgency === "overdue" ? `${Math.abs(p.daysUntilDue)}d late` : `${money(p.amount)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/payments" className="mt-3 inline-block text-sm font-medium text-brand-600">
            Manage payments →
          </Link>
        </div>
      </div>
    </div>
  );
}
