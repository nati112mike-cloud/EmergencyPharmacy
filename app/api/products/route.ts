import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/business";

export async function GET() {
  const products = await prisma.product.findMany({
    include: { batches: true, defaultSupplier: true },
    orderBy: { name: "asc" },
  });

  const withStock = products.map((p) => {
    const stock = p.batches
      .filter((b) => b.quantity > 0 && !isExpired(b.expiryDate))
      .reduce((sum, b) => sum + b.quantity, 0);
    return { ...p, stock };
  });

  return NextResponse.json(withStock);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sku, name, category, unit, description, price, reorderPoint, reorderQty, requiresRx, defaultSupplierId } = body;

  if (!sku || !name || price == null) {
    return NextResponse.json({ error: "sku, name and price are required" }, { status: 400 });
  }

  try {
    const product = await prisma.product.create({
      data: {
        sku,
        name,
        category: category || null,
        unit: unit || "unit",
        description: description || null,
        price: Number(price),
        reorderPoint: reorderPoint != null ? Number(reorderPoint) : undefined,
        reorderQty: reorderQty != null ? Number(reorderQty) : undefined,
        requiresRx: !!requiresRx,
        defaultSupplierId: defaultSupplierId || null,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
