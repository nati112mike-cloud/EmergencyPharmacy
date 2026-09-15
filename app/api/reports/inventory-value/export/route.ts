import { NextResponse } from "next/server";
import { getInventoryValue } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildWorkbook, xlsxResponseHeaders } from "@/lib/excelExport";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const value = await getInventoryValue();

  const buffer = await buildWorkbook([
    {
      name: "Inventory Value",
      columns: [
        { header: "Category", key: "categoryName", width: 22 },
        { header: "Units", key: "unitCount", width: 12 },
        { header: "Cost Value", key: "costValue", width: 14 },
        { header: "Retail Value", key: "retailValue", width: 14 },
      ],
      rows: [
        ...value.byCategory.map((c) => ({
          categoryName: c.categoryName,
          unitCount: c.unitCount,
          costValue: c.costValue,
          retailValue: c.retailValue,
        })),
        {
          categoryName: "TOTAL",
          unitCount: value.byCategory.reduce((s, c) => s + c.unitCount, 0),
          costValue: value.totalCostValue,
          retailValue: value.totalRetailValue,
        },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`inventory-value-${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}
