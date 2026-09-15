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
      include: { batches: true, defaultSupplier: true, category: true, units: true },
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
// categories are open-ended, so the UI can offer "add new" inline. Also
// accepts an optional initial batch (batchNumber/quantity/costPrice/
// expiryDate/location) and an optional units array (packaging levels —
// see ProductUnit) so a brand-new product can be created with its first
// stock and packaging conversions in one step instead of three.
// If existingProductId is given, no new product is created at all — the
// batch (and any newPrice) is applied to that product instead, which is
// how the Add Product form avoids creating a duplicate catalog entry when
// the admin picks an already-existing match while typing.
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
    existingProductId,
    units,
    batch,
  } = body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      let product;
      let created = false;

      if (existingProductId) {
        product = await tx.product.findUnique({ where: { id: existingProductId } });
        if (!product) throw new Error("Selected existing product not found");
      } else {
        if (!sku || !name || price == null) {
          throw new Error("sku, name and price are required");
        }
        let resolvedCategoryId: string | null = categoryId || null;
        if (!resolvedCategoryId && categoryName?.trim()) {
          const category = await tx.category.upsert({
            where: { name: categoryName.trim() },
            update: {},
            create: { name: categoryName.trim() },
          });
          resolvedCategoryId = category.id;
        }

        product = await tx.product.create({
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
        created = true;

        if (Array.isArray(units)) {
          for (const u of units) {
            if (!u.name || !u.factor || u.price == null || Number(u.factor) <= 1) continue;
            await tx.productUnit.create({
              data: { productId: product.id, name: String(u.name).trim(), factor: Number(u.factor), price: Number(u.price) },
            });
          }
        }
      }

      let createdBatch = null;
      if (batch?.batchNumber && batch?.quantity && batch?.costPrice != null && batch?.expiryDate) {
        createdBatch = await tx.batch.create({
          data: {
            productId: product.id,
            batchNumber: batch.batchNumber,
            quantity: Number(batch.quantity),
            costPrice: Number(batch.costPrice),
            expiryDate: new Date(batch.expiryDate),
            supplierId: batch.supplierId || null,
            location: batch.location === "DISPLAY" ? "DISPLAY" : "STORE",
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            batchId: createdBatch.id,
            type: "PURCHASE_RECEIPT",
            quantity: Number(batch.quantity),
            note: created ? "Initial stock at product creation" : "Added via Add Product (existing match)",
            performedBy: admin.name,
          },
        });
      }

      return { product, created, createdBatch };
    });

    if (result.created) {
      await logAudit(admin.name, "product.create", `Added product "${result.product.name}" (${result.product.sku})`);
    } else if (result.createdBatch) {
      await logAudit(
        admin.name,
        "product.add_batch",
        `Added batch "${result.createdBatch.batchNumber}" to existing product "${result.product.name}"`
      );
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
