import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { name, barcode, categoryId, unit, description, price, reorderPoint, reorderQty, requiresRx, defaultSupplierId } = body;

  try {
    const existing = price !== undefined ? await prisma.product.findUnique({ where: { id: params.id } }) : null;

    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(barcode !== undefined && { barcode: barcode?.trim() || null }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(unit !== undefined && { unit }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(reorderPoint !== undefined && { reorderPoint: Number(reorderPoint) }),
        ...(reorderQty !== undefined && { reorderQty: Number(reorderQty) }),
        ...(requiresRx !== undefined && { requiresRx: !!requiresRx }),
        ...(defaultSupplierId !== undefined && { defaultSupplierId: defaultSupplierId || null }),
      },
    });

    if (existing && Number(price) !== existing.price) {
      await prisma.priceHistory.create({
        data: {
          productId: params.id,
          oldPrice: existing.price,
          newPrice: Number(price),
          changedBy: admin.name,
        },
      });
    }

    return NextResponse.json(product);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const target = await prisma.product.findUnique({ where: { id: params.id } });
    await prisma.product.delete({ where: { id: params.id } });
    if (target) await logAudit(admin.name, "product.delete", `Deleted product "${target.name}" (${target.sku})`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const isFkError = err instanceof Error && err.message.includes("Foreign key constraint");
    const message = isFkError
      ? "This product has sales, purchase, or stock history and can't be deleted — consider removing its remaining stock instead."
      : err instanceof Error
      ? err.message
      : "Failed to delete product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
