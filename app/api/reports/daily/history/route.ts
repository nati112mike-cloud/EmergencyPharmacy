import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const reports = await prisma.dailyReport.findMany({
    orderBy: { reportDate: "desc" },
    take: 60,
  });
  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      reportDate: r.reportDate,
      totalRevenue: r.totalRevenue,
      totalCost: r.totalCost,
      totalProfit: r.totalProfit,
      totalSalesCount: r.totalSalesCount,
      totalPurchaseCount: r.totalPurchaseCount,
      totalPurchaseCost: r.totalPurchaseCost,
      topSellers: JSON.parse(r.topSellersJson),
      lowStock: JSON.parse(r.lowStockJson),
      expiring: JSON.parse(r.expiringJson),
    }))
  );
}
