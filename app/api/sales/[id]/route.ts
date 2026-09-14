import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// Full line-item detail for one sale, including how much of each line has
// already been returned — used by the Refund dialog on the Daily Reports
// page. Admin-only since refunds are a financial action.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: { items: { include: { product: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  return NextResponse.json({
    id: sale.id,
    saleDate: sale.saleDate,
    totalAmount: sale.totalAmount,
    paymentMethod: sale.paymentMethod,
    cashierName: sale.cashierName,
    items: sale.items.map((i) => ({
      id: i.id,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      returnedQuantity: i.returnedQuantity,
    })),
  });
}
