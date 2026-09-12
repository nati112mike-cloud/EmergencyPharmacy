import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { name, category, unit, description, price, reorderPoint, reorderQty, requiresRx, defaultSupplierId } = body;

  try {
    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(unit !== undefined && { unit }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(reorderPoint !== undefined && { reorderPoint: Number(reorderPoint) }),
        ...(reorderQty !== undefined && { reorderQty: Number(reorderQty) }),
        ...(requiresRx !== undefined && { requiresRx: !!requiresRx }),
        ...(defaultSupplierId !== undefined && { defaultSupplierId: defaultSupplierId || null }),
      },
    });
    return NextResponse.json(product);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete product";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
