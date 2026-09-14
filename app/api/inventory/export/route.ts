import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildWorkbook, xlsxResponseHeaders } from "@/lib/excelExport";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const products = await prisma.product.findMany({
    include: { batches: true, category: true, defaultSupplier: true },
    orderBy: { name: "asc" },
  });

  const rows = products.map((p) => {
    const live = p.batches.filter((b) => b.quantity > 0 && !isExpired(b.expiryDate));
    const storeStock = live.filter((b) => b.location === "STORE").reduce((s, b) => s + b.quantity, 0);
    const displayStock = live.filter((b) => b.location === "DISPLAY").reduce((s, b) => s + b.quantity, 0);
    const soonestExpiry = live
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())[0]?.expiryDate;
    return {
      sku: p.sku,
      name: p.name,
      category: p.category?.name ?? "",
      unit: p.unit,
      price: p.price,
      storeStock,
      displayStock,
      totalStock: storeStock + displayStock,
      reorderPoint: p.reorderPoint,
      reorderQty: p.reorderQty,
      defaultSupplier: p.defaultSupplier?.name ?? "",
      soonestExpiry: soonestExpiry ? soonestExpiry.toISOString().slice(0, 10) : "",
    };
  });

  const buffer = await buildWorkbook([
    {
      name: "Inventory",
      columns: [
        { header: "SKU", key: "sku", width: 16 },
        { header: "Name", key: "name", width: 30 },
        { header: "Category", key: "category", width: 16 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Price", key: "price", width: 10 },
        { header: "Store Stock", key: "storeStock", width: 12 },
        { header: "Display Stock", key: "displayStock", width: 14 },
        { header: "Total Stock", key: "totalStock", width: 12 },
        { header: "Reorder Point", key: "reorderPoint", width: 14 },
        { header: "Reorder Qty", key: "reorderQty", width: 12 },
        { header: "Default Supplier", key: "defaultSupplier", width: 22 },
        { header: "Soonest Expiry", key: "soonestExpiry", width: 14 },
      ],
      rows,
    },
  ]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`inventory-${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}
