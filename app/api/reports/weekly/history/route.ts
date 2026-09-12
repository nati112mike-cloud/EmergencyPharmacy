import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const reports = await prisma.weeklyReport.findMany({
    orderBy: { weekStart: "desc" },
    take: 26,
  });
  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      totalRevenue: r.totalRevenue,
      totalCost: r.totalCost,
      totalProfit: r.totalProfit,
      totalSalesCount: r.totalSalesCount,
      topSellers: JSON.parse(r.topSellersJson),
      lowStock: JSON.parse(r.lowStockJson),
      expiring: JSON.parse(r.expiringJson),
    }))
  );
}
