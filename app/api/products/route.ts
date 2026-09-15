import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function GET() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [products, recentSaleItems] = await Promise.all([
    prisma.product.findMany({
      include: { batches: true, defaultSupplier: true, category: true },
      orderBy: { name: "asc" },
    }),
    // Powers the fast/slow-moving sort — units sold in the last 30 days,
    // per product. A raw groupBy would be neater but SaleItem has no direct
    // date column (it's on the related Sale), so this joins instead.
    prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: thirtyDaysAgo } } },
      select: { productId: true, quantity: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const item of recentSaleItems) {
    soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  const withStock = products.map((p) => {
    const live = p.batches.filter((b) => b.quantity > 0 && !isExpired(b.expiryDate));
    const storeStock = live.filter((b) => b.location === "STORE").reduce((s, b) => s + b.quantity, 0);
    const displayStock = live.filter((b) => b.location === "DISPLAY").reduce((s, b) => s + b.quantity, 0);
    const stock = storeStock + displayStock;
    return {
      ...p,
      storeStock,
      displayStock,
      stock,
      unitsSold30d: soldByProduct.get(p.id) ?? 0,
      stockValue: stock * p.price,
    };
  });

  return NextResponse.json(withStock);
}

// Accepts either categoryId, or categoryName to create/reuse a category —
// categories are open-ended, so the UI can offer "add new" inline.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const {
    sku,
    barcode,
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
        barcode: barcode?.trim() || null,
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
    await logAudit(admin.name, "product.create", `Added product "${product.name}" (${product.sku})`);
    return NextResponse.json(product, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
