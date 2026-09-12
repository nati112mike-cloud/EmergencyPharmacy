import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Manually record a stock receipt (batch) for a product — used for direct
// deliveries that don't go through a formal purchase order.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { batchNumber, quantity, costPrice, expiryDate, supplierId, location } = body;

  if (!batchNumber || quantity == null || costPrice == null || !expiryDate) {
    return NextResponse.json(
      { error: "batchNumber, quantity, costPrice and expiryDate are required" },
      { status: 400 }
    );
  }
  if (location && location !== "STORE" && location !== "DISPLAY") {
    return NextResponse.json({ error: "location must be STORE or DISPLAY" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          productId: params.id,
          batchNumber,
          quantity: Number(quantity),
          costPrice: Number(costPrice),
          expiryDate: new Date(expiryDate),
          supplierId: supplierId || null,
          location: location || "STORE",
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: params.id,
          batchId: batch.id,
          type: "PURCHASE_RECEIPT",
          quantity: Number(quantity),
          note: "Manual stock receipt",
        },
      });
      return batch;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
