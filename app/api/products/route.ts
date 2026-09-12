import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/business";

export async function GET() {
  const products = await prisma.product.findMany({
    include: { batches: true, defaultSupplier: true, category: true },
    orderBy: { name: "asc" },
  });

  const withStock = products.map((p) => {
    const live = p.batches.filter((b) => b.quantity > 0 && !isExpired(b.expiryDate));
    const storeStock = live.filter((b) => b.location === "STORE").reduce((s, b) => s + b.quantity, 0);
    const displayStock = live.filter((b) => b.location === "DISPLAY").reduce((s, b) => s + b.quantity, 0);
    return { ...p, storeStock, displayStock, stock: storeStock + displayStock };
  });

  return NextResponse.json(withStock);
}

// Accepts either categoryId, or categoryName to create/reuse a category —
// categories are open-ended, so the UI can offer "add new" inline.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    sku,
    name,
    categoryId,
    categoryName,
    unit,
    description,
    price,
    reorderPoint,
    reorderQty,
    requiresRx,
    defaultSupplierId,
  } = body;

  if (!sku || !name || price == null) {
    return NextResponse.json({ error: "sku, name and price are required" }, { status: 400 });
  }

  try {
    let resolvedCategoryId: string | null = categoryId || null;
    if (!resolvedCategoryId && categoryName?.trim()) {
      const category = await prisma.category.upsert({
        where: { name: categoryName.trim() },
        update: {},
        create: { name: categoryName.trim() },
      });
      resolvedCategoryId = category.id;
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        categoryId: resolvedCategoryId,
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
