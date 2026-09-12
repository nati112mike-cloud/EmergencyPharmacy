import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLowStockProducts, getExpiringBatches, startOfWeek } from "@/lib/business";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(now);

  const [todaySales, weekSaleItems, lowStock, expiring] = await Promise.all([
    prisma.sale.findMany({ where: { saleDate: { gte: todayStart } } }),
    prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: weekStart } } },
      include: { product: true },
    }),
    getLowStockProducts(),
    getExpiringBatches(),
  ]);

  const todayRevenue = todaySales.reduce((s, sale) => s + sale.totalAmount, 0);
  const weekRevenue = weekSaleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const weekProfit = weekSaleItems.reduce(
    (s, i) => s + i.quantity * (i.unitPrice - i.unitCost),
    0
  );

  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of weekSaleItems) {
    const entry = byProduct.get(item.productId) ?? {
      name: item.product.name,
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += item.quantity;
    entry.revenue += item.quantity * item.unitPrice;
    byProduct.set(item.productId, entry);
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return NextResponse.json({
    todaySalesCount: todaySales.length,
    todayRevenue,
    weekRevenue,
    weekProfit,
    lowStockCount: lowStock.length,
    expiringCount: expiring.length,
    topProducts,
    lowStock: lowStock.slice(0, 5),
    expiring: expiring.slice(0, 5),
  });
}
