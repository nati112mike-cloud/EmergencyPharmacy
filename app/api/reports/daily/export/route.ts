import { NextRequest, NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildWorkbook, xlsxResponseHeaders } from "@/lib/excelExport";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const day = dateParam ? new Date(dateParam) : new Date();

  const report = await buildDailyReport(day);
  const dateLabel = report.reportDate.toISOString().slice(0, 10);

  const buffer = await buildWorkbook([
    {
      name: "Summary",
      columns: [
        { header: "Metric", key: "metric", width: 24 },
        { header: "Value", key: "value", width: 18 },
      ],
      rows: [
        { metric: "Date", value: dateLabel },
        { metric: "Total Revenue", value: report.totalRevenue },
        { metric: "Total Cost", value: report.totalCost },
        { metric: "Total Profit", value: report.totalProfit },
        { metric: "Sales Count", value: report.totalSalesCount },
        { metric: "Purchases Count", value: report.totalPurchaseCount },
        { metric: "Purchases Cost", value: report.totalPurchaseCost },
      ],
    },
    {
      name: "Sales",
      columns: [
        { header: "Time", key: "time", width: 18 },
        { header: "Sale ID", key: "id", width: 16 },
        { header: "Items", key: "itemCount", width: 10 },
        { header: "Payment Method", key: "paymentMethod", width: 16 },
        { header: "Cashier", key: "cashierName", width: 18 },
        { header: "Total", key: "totalAmount", width: 12 },
      ],
      rows: report.sales.map((s) => ({
        time: s.saleDate.toLocaleTimeString(),
        id: s.id.slice(-8),
        itemCount: s.itemCount,
        paymentMethod: s.paymentMethod,
        cashierName: s.cashierName ?? "",
        totalAmount: s.totalAmount,
      })),
    },
    {
      name: "Purchases",
      columns: [
        { header: "Supplier", key: "supplierName", width: 24 },
        { header: "Status", key: "status", width: 12 },
        { header: "Items", key: "itemCount", width: 10 },
        { header: "Total Cost", key: "totalCost", width: 12 },
        { header: "Posted By", key: "createdBy", width: 18 },
      ],
      rows: report.purchases.map((p) => ({
        supplierName: p.supplierName,
        status: p.status,
        itemCount: p.itemCount,
        totalCost: p.totalCost,
        createdBy: p.createdBy ?? "",
      })),
    },
  ]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`daily-report-${dateLabel}.xlsx`),
  });
}
