import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const orders = await prisma.purchaseOrder.findMany({
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { orderDate: "desc" },
  });
  return NextResponse.json(orders);
}

// body: { supplierId, expectedDate?, notes?, items: [{ productId, quantity, unitCost }] }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { supplierId, expectedDate, notes, items } = body;

  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "supplierId and at least one item are required" },
      { status: 400 }
    );
  }

  try {
    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        notes: notes || null,
        status: "ORDERED",
        items: {
          create: items.map((i: { productId: string; quantity: number; unitCost: number }) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitCost: Number(i.unitCost),
          })),
        },
      },
      include: { items: { include: { product: true } }, supplier: true },
    });
    return NextResponse.json(po, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create purchase order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
