import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// Manually record a stock receipt (batch) for a product — used for direct
// deliveries that don't go through a formal purchase order. If the exact
// same lot (batch number + location + expiry + cost) already exists, its
// quantity is topped up instead of creating a duplicate batch row — so
// receiving the same lot twice doesn't fragment the batch list.
//
// Quantity/cost can be given either in the product's base unit (as before)
// or in one of its packaging units (unitName + unitQuantity + unitCostPrice)
// — e.g. "received 5 boxes at $170/box" — which gets converted to base
// units/cost for storage; receivedUnitLabel/receivedUnitQty keep the
// original wording for display. Optionally also updates the product's (or
// a specific packaging unit's) selling price — new stock arriving at a new
// cost is the normal moment to reprice, and since price lives on the
// product/unit (not per-batch), that applies to *all* remaining stock of
// this product at once, old batches included.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { batchNumber, expiryDate, supplierId, location, unitName, newPrice, newUnitPrices } = body;
  let { quantity, costPrice } = body;

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
      let receivedUnitLabel: string | null = null;
      let receivedUnitQty: number | null = null;

      if (unitName) {
        const pu = await tx.productUnit.findUnique({
          where: { productId_name: { productId: params.id, name: unitName } },
        });
        if (!pu) throw new Error(`"${unitName}" isn't a defined unit for this product`);
        receivedUnitLabel = pu.name;
        receivedUnitQty = Number(quantity);
        costPrice = Number(costPrice) / pu.factor; // given as cost-per-unit, stored as cost-per-base
        quantity = Number(quantity) * pu.factor;
      }

      const existing = await tx.batch.findFirst({
        where: {
          productId: params.id,
          batchNumber,
          location: location || "STORE",
          expiryDate: new Date(expiryDate),
          costPrice: Number(costPrice),
        },
      });

      const batch = existing
        ? await tx.batch.update({
            where: { id: existing.id },
            data: { quantity: { increment: Number(quantity) } },
          })
        : await tx.batch.create({
            data: {
              productId: params.id,
              batchNumber,
              quantity: Number(quantity),
              costPrice: Number(costPrice),
              expiryDate: new Date(expiryDate),
              supplierId: supplierId || null,
              location: location || "STORE",
              receivedUnitLabel,
              receivedUnitQty,
            },
          });
      await tx.stockMovement.create({
        data: {
          productId: params.id,
          batchId: batch.id,
          type: "PURCHASE_RECEIPT",
          quantity: Number(quantity),
          note: existing ? "Manual stock receipt (added to existing batch)" : "Manual stock receipt",
          performedBy: admin.name,
        },
      });

      let pricedChanged = false;
      if (newPrice != null) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: params.id } });
        if (Number(newPrice) !== product.price) {
          await tx.product.update({ where: { id: params.id }, data: { price: Number(newPrice) } });
          await tx.priceHistory.create({
            data: {
              productId: params.id,
              oldPrice: product.price,
              newPrice: Number(newPrice),
              changedBy: admin.name,
            },
          });
          pricedChanged = true;
        }
      }
      if (Array.isArray(newUnitPrices)) {
        for (const u of newUnitPrices) {
          if (!u.name || u.price == null) continue;
          await tx.productUnit.updateMany({
            where: { productId: params.id, name: u.name },
            data: { price: Number(u.price) },
          });
        }
      }

      return { batch, pricedChanged };
    });

    if (result.pricedChanged) {
      await logAudit(admin.name, "product.reprice_on_receipt", `Updated selling price on receiving stock for product ${params.id}`);
    }
    return NextResponse.json(result.batch, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
