import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// Combined timeline for one product: stock movements (purchases, sales,
// transfers, adjustments) and price changes, newest first.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const [movements, priceHistory, product] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { productId: params.id },
      include: { batch: { select: { batchNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.priceHistory.findMany({
      where: { productId: params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.product.findUnique({ where: { id: params.id }, select: { name: true, sku: true } }),
  ]);

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  return NextResponse.json({
    product,
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      note: m.note,
      batchNumber: m.batch?.batchNumber ?? null,
      performedBy: m.performedBy,
      createdAt: m.createdAt,
    })),
    priceHistory,
  });
}
