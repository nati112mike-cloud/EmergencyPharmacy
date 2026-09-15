import { prisma } from "@/lib/prisma";
import { postSaleTransaction } from "@/lib/finance";
import { PaymentMethod, BatchLocation, StockMovementType } from "@/lib/types";

/** A batch is flagged "expiring soon" inside this many days. */
export const EXPIRY_WARNING_DAYS = 90;

export function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function isExpired(date: Date): boolean {
  return date.getTime() < Date.now();
}

export function isExpiringSoon(date: Date): boolean {
  const d = daysUntil(date);
  return d >= 0 && d <= EXPIRY_WARNING_DAYS;
}

/** Total remaining quantity across a product's non-expired batches, optionally scoped to one location. */
export async function getProductStock(
  productId: string,
  location?: BatchLocation
): Promise<number> {
  const batches = await prisma.batch.findMany({
    where: { productId, quantity: { gt: 0 }, ...(location && { location }) },
  });
  return batches
    .filter((b) => !isExpired(b.expiryDate))
    .reduce((sum, b) => sum + b.quantity, 0);
}

export type LowStockItem = {
  productId: string;
  sku: string;
  name: string;
  stock: number;
  storeStock: number;
  displayStock: number;
  reorderPoint: number;
  reorderQty: number;
  defaultSupplierId: string | null;
  defaultSupplierName: string | null;
  lastCostPrice: number;
};

/** Products whose sellable (non-expired) stock, across store + display, is at or below their reorder point. */
export async function getLowStockProducts(): Promise<LowStockItem[]> {
  const products = await prisma.product.findMany({
    include: {
      defaultSupplier: true,
      batches: { orderBy: { receivedDate: "desc" } },
    },
  });

  const result: LowStockItem[] = [];
  for (const p of products) {
    const live = p.batches.filter((b) => b.quantity > 0 && !isExpired(b.expiryDate));
    const storeStock = live.filter((b) => b.location === "STORE").reduce((s, b) => s + b.quantity, 0);
    const displayStock = live.filter((b) => b.location === "DISPLAY").reduce((s, b) => s + b.quantity, 0);
    const stock = storeStock + displayStock;
    if (stock <= p.reorderPoint) {
      result.push({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        stock,
        storeStock,
        displayStock,
        reorderPoint: p.reorderPoint,
        reorderQty: p.reorderQty,
        defaultSupplierId: p.defaultSupplierId,
        defaultSupplierName: p.defaultSupplier?.name ?? null,
        // Last-known cost is the best default when drafting a reorder; it is
        // never used to backfill an actual receipt, only to pre-fill the PO form.
        lastCostPrice: p.batches[0]?.costPrice ?? 0,
      });
    }
  }
  return result.sort((a, b) => a.stock - b.stock);
}

export type ExpiringBatch = {
  batchId: string;
  productId: string;
  productName: string;
  sku: string;
  batchNumber: string;
  quantity: number;
  location: BatchLocation;
  expiryDate: Date;
  daysUntilExpiry: number;
  status: "expired" | "expiring_soon";
  suggestedDiscountPercent: number; // 0 for already-expired batches — write off, don't discount
};

/**
 * A rough markdown ladder so stock actually sells before it expires instead
 * of becoming a write-off — steeper the closer to the expiry date. Advisory
 * only: nothing applies this automatically, it's just a number shown next to
 * the batch so an admin can decide to reprice.
 */
export function suggestedDiscountPercent(daysUntilExpiry: number): number {
  if (daysUntilExpiry < 0) return 0; // already expired — write off, not discount
  if (daysUntilExpiry <= 30) return 50;
  if (daysUntilExpiry <= 60) return 25;
  if (daysUntilExpiry <= 90) return 10;
  return 0;
}

/** Batches already expired or expiring within EXPIRY_WARNING_DAYS, soonest first. */
export async function getExpiringBatches(): Promise<ExpiringBatch[]> {
  const batches = await prisma.batch.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: true },
    orderBy: { expiryDate: "asc" },
  });

  return batches
    .filter((b) => isExpired(b.expiryDate) || isExpiringSoon(b.expiryDate))
    .map((b) => {
      const daysLeft = daysUntil(b.expiryDate);
      return {
        batchId: b.id,
        productId: b.productId,
        productName: b.product.name,
        sku: b.product.sku,
        batchNumber: b.batchNumber,
        quantity: b.quantity,
        location: b.location as BatchLocation,
        expiryDate: b.expiryDate,
        daysUntilExpiry: daysLeft,
        status: isExpired(b.expiryDate) ? "expired" : "expiring_soon",
        suggestedDiscountPercent: suggestedDiscountPercent(daysLeft),
      };
    });
}

export type InventoryValueByCategory = {
  categoryId: string | null;
  categoryName: string;
  costValue: number;
  retailValue: number;
  unitCount: number;
};

export type InventoryValue = {
  totalCostValue: number;
  totalRetailValue: number;
  byCategory: InventoryValueByCategory[];
};

/**
 * A snapshot (as of right now, not scoped to any day) of what the current
 * stock is worth — at cost (what was paid for it, i.e. money tied up in
 * inventory) and at retail (what it would bring in if all sold), broken
 * down by category. Only counts non-expired batches with quantity left.
 */
export async function getInventoryValue(): Promise<InventoryValue> {
  const batches = await prisma.batch.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: { include: { category: true } } },
  });

  const live = batches.filter((b) => !isExpired(b.expiryDate));

  const byCategory = new Map<string, InventoryValueByCategory>();
  let totalCostValue = 0;
  let totalRetailValue = 0;

  for (const b of live) {
    const categoryId = b.product.categoryId;
    const categoryName = b.product.category?.name ?? "Uncategorized";
    const key = categoryId ?? "__uncategorized__";
    const cost = b.costPrice * b.quantity;
    const retail = b.product.price * b.quantity;

    const entry = byCategory.get(key) ?? {
      categoryId,
      categoryName,
      costValue: 0,
      retailValue: 0,
      unitCount: 0,
    };
    entry.costValue += cost;
    entry.retailValue += retail;
    entry.unitCount += b.quantity;
    byCategory.set(key, entry);

    totalCostValue += cost;
    totalRetailValue += retail;
  }

  return {
    totalCostValue,
    totalRetailValue,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.costValue - a.costValue),
  };
}

/**
 * Zeroes out an expired batch and logs a WRITE_OFF_EXPIRED movement — the
 * stock is gone (spoiled/destroyed), not sellable, so this doesn't move
 * quantity anywhere the way a transfer or return does.
 */
export async function writeOffBatch(batchId: string, performedBy?: string) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new Error("Batch not found");
    if (batch.quantity <= 0) throw new Error("Batch has no remaining quantity to write off");

    const written = batch.quantity;
    const updated = await tx.batch.update({
      where: { id: batchId },
      data: { quantity: 0 },
    });

    await tx.stockMovement.create({
      data: {
        productId: batch.productId,
        batchId: batch.id,
        type: "WRITE_OFF_EXPIRED",
        quantity: -written,
        note: `Wrote off ${written} unit(s), batch ${batch.batchNumber}`,
        performedBy,
      },
    });

    return updated;
  });
}

export type CartLine = {
  productId: string;
  quantity: number; // in the chosen unit (unitName), or base units if unitName is omitted
  unitName?: string; // e.g. "box" — one of the product's ProductUnit rows; omit for the base unit
  batchId?: string; // sell from this exact batch (required for non-base units — see below)
};

export type CheckoutResult = {
  saleId: string;
  totalAmount: number;
};

/**
 * Records a sale and decrements stock. Plain base-unit lines (no unitName)
 * behave exactly as before: FEFO (first-expiry-first-out) across all
 * non-expired DISPLAY batches, splitting across batches if one lot doesn't
 * cover the full quantity. Selling by a packaging unit (box/pack/strip) or
 * an explicitly chosen batch is different on purpose: it must be fulfilled
 * from a *single* batch — a "box" can't be half from one lot and half from
 * another — so either supply batchId yourself or let the soonest-expiring
 * batch with enough stock be picked automatically; if none has enough,
 * checkout fails rather than silently splitting a packaged unit across lots.
 */
export async function checkout(
  lines: CartLine[],
  opts: {
    paymentMethod?: PaymentMethod;
    cashierName?: string;
    creditorName?: string;
    financeAccountId?: string;
  } = {}
): Promise<CheckoutResult> {
  if (lines.length === 0) throw new Error("Cart is empty");
  if (opts.paymentMethod === "CREDIT" && !opts.creditorName?.trim()) {
    throw new Error("A buyer name is required for credit sales");
  }

  const result = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItemsData: {
      productId: string;
      batchId: string | null;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      soldUnitLabel: string | null;
      soldUnitQty: number | null;
    }[] = [];
    const movements: { productId: string; batchId: string; quantity: number }[] = [];

    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        include: { units: true },
      });
      if (!product) throw new Error(`Product ${line.productId} not found`);

      let factor = 1;
      let baseUnitPrice = product.price;
      let soldUnitLabel: string | null = null;
      let soldUnitQty: number | null = null;

      if (line.unitName) {
        const pu = product.units.find((u) => u.name === line.unitName);
        if (!pu) throw new Error(`"${line.unitName}" isn't a defined unit for ${product.name}`);
        factor = pu.factor;
        baseUnitPrice = pu.price / factor;
        soldUnitLabel = pu.name;
        soldUnitQty = line.quantity;
      }
      const baseQty = line.quantity * factor;

      if (line.batchId || factor > 1) {
        // Single-batch path: an explicit batch, or any non-base unit.
        const batch = line.batchId
          ? await tx.batch.findUnique({ where: { id: line.batchId } })
          : (
              await tx.batch.findMany({
                where: { productId: line.productId, quantity: { gte: baseQty }, location: "DISPLAY" },
                orderBy: { expiryDate: "asc" },
              })
            ).find((b) => !isExpired(b.expiryDate));

        if (!batch || batch.productId !== line.productId) {
          throw new Error(`Batch not found for ${product.name}`);
        }
        if (batch.location !== "DISPLAY" || isExpired(batch.expiryDate) || batch.quantity < baseQty) {
          const unitDesc = soldUnitLabel ? `${line.quantity} ${soldUnitLabel}(s)` : `${baseQty} unit(s)`;
          throw new Error(
            `Insufficient display stock in a single batch for ${product.name} (${unitDesc})` +
              (soldUnitLabel ? " — try selling as loose base units instead, or transfer more stock first" : "")
          );
        }

        await tx.batch.update({ where: { id: batch.id }, data: { quantity: { decrement: baseQty } } });
        saleItemsData.push({
          productId: product.id,
          batchId: batch.id,
          quantity: baseQty,
          unitPrice: baseUnitPrice,
          unitCost: batch.costPrice,
          soldUnitLabel,
          soldUnitQty,
        });
        movements.push({ productId: product.id, batchId: batch.id, quantity: -baseQty });
        totalAmount += baseQty * baseUnitPrice;
        continue;
      }

      // Base-unit path: FEFO across batches, splitting if needed (original behavior).
      const batches = await tx.batch.findMany({
        where: { productId: line.productId, quantity: { gt: 0 }, location: "DISPLAY" },
        orderBy: { expiryDate: "asc" },
      });
      const available = batches.filter((b) => !isExpired(b.expiryDate));

      let remaining = baseQty;
      for (const batch of available) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        if (take <= 0) continue;

        await tx.batch.update({ where: { id: batch.id }, data: { quantity: { decrement: take } } });
        saleItemsData.push({
          productId: product.id,
          batchId: batch.id,
          quantity: take,
          unitPrice: baseUnitPrice,
          unitCost: batch.costPrice,
          soldUnitLabel: null,
          soldUnitQty: null,
        });
        movements.push({ productId: product.id, batchId: batch.id, quantity: -take });
        totalAmount += take * baseUnitPrice;
        remaining -= take;
      }

      if (remaining > 0) {
        const storeStock = await getProductStock(line.productId, "STORE");
        const hint =
          storeStock > 0
            ? ` (${storeStock} unit(s) available in store — transfer to display first)`
            : "";
        throw new Error(
          `Insufficient display stock for ${product.name}: short by ${remaining} unit(s)${hint}`
        );
      }
    }

    const isCredit = opts.paymentMethod === "CREDIT";
    const sale = await tx.sale.create({
      data: {
        totalAmount,
        paymentMethod: opts.paymentMethod ?? "CASH",
        cashierName: opts.cashierName,
        financeAccountId: opts.financeAccountId,
        creditorName: isCredit ? opts.creditorName : undefined,
        creditPaymentStatus: isCredit ? "UNPAID" : undefined,
        items: { create: saleItemsData },
      },
    });

    for (const m of movements) {
      await tx.stockMovement.create({
        data: {
          productId: m.productId,
          batchId: m.batchId,
          type: "SALE",
          quantity: m.quantity,
          note: `Sale ${sale.id}`,
          performedBy: opts.cashierName,
        },
      });
    }

    return { saleId: sale.id, totalAmount };
  });

  // Money that landed directly in a bank/Telebirr account is posted to the
  // ledger outside the sale transaction (it's a separate concern — if this
  // fails, the sale itself has still correctly happened and shouldn't roll back).
  if (opts.financeAccountId && (opts.paymentMethod === "BANK_TRANSFER" || opts.paymentMethod === "TELEBIRR")) {
    await postSaleTransaction(result.saleId, opts.financeAccountId, result.totalAmount, opts.cashierName);
  }

  return result;
}

export type ReturnResult = {
  saleReturnId: string;
  refundAmount: number;
  remainingReturnable: number;
};

/**
 * Refunds (part of) one sale line. Stock goes back to the batch it was sold
 * from if that batch still exists — otherwise it's just a paper refund with
 * no stock adjustment (the lot is gone, e.g. long since re-transferred or
 * the DB row was somehow removed). Multiple partial returns against the same
 * line are allowed as long as the total doesn't exceed what was sold.
 */
export async function processReturn(
  saleItemId: string,
  quantity: number,
  opts: { reason?: string; performedBy?: string } = {}
): Promise<ReturnResult> {
  if (quantity <= 0) throw new Error("Return quantity must be positive");

  return prisma.$transaction(async (tx) => {
    const saleItem = await tx.saleItem.findUnique({ where: { id: saleItemId } });
    if (!saleItem) throw new Error("Sale line not found");

    const returnable = saleItem.quantity - saleItem.returnedQuantity;
    if (quantity > returnable) {
      throw new Error(`Only ${returnable} unit(s) left returnable on this line`);
    }

    if (saleItem.batchId) {
      const batch = await tx.batch.findUnique({ where: { id: saleItem.batchId } });
      if (batch) {
        await tx.batch.update({ where: { id: batch.id }, data: { quantity: { increment: quantity } } });
        await tx.stockMovement.create({
          data: {
            productId: saleItem.productId,
            batchId: batch.id,
            type: "RETURN",
            quantity,
            note: `Return against sale item ${saleItem.id}`,
            performedBy: opts.performedBy,
          },
        });
      }
    }

    await tx.saleItem.update({
      where: { id: saleItemId },
      data: { returnedQuantity: { increment: quantity } },
    });

    const refundAmount = quantity * saleItem.unitPrice;
    const saleReturn = await tx.saleReturn.create({
      data: {
        saleItemId,
        quantity,
        refundAmount,
        reason: opts.reason,
        processedBy: opts.performedBy,
      },
    });

    return {
      saleReturnId: saleReturn.id,
      refundAmount,
      remainingReturnable: returnable - quantity,
    };
  });
}

/** Marks a purchase order as received and creates a stock batch per line item. */
export async function receivePurchaseOrder(purchaseOrderId: string, performedBy?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) throw new Error("Purchase order not found");
    if (po.status === "RECEIVED") throw new Error("Purchase order already received");

    for (const item of po.items) {
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 2); // placeholder until batch-level detail is entered

      const batch = await tx.batch.create({
        data: {
          productId: item.productId,
          batchNumber: `PO-${po.id.slice(-6)}`,
          quantity: item.quantity,
          costPrice: item.unitCost,
          expiryDate,
          supplierId: po.supplierId,
          location: "STORE", // received stock lands in the back room, not the shelf
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          batchId: batch.id,
          type: "PURCHASE_RECEIPT",
          quantity: item.quantity,
          note: `Received PO ${po.id}`,
          performedBy: performedBy ?? po.createdBy ?? undefined,
        },
      });
    }

    return tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "RECEIVED", receivedDate: new Date() },
    });
  });
}

/**
 * Moves quantity from one batch to the other location, splitting/merging as
 * needed. Used for "stock the shelf" (STORE -> DISPLAY) and to correct a
 * mistaken transfer (DISPLAY -> STORE). The source batch is decremented; the
 * quantity lands in an existing batch at the destination location that
 * shares the same lot (batch number + expiry + cost) if one exists, or a new
 * batch row otherwise — so the same physical lot never fragments needlessly.
 */
export async function transferStock(sourceBatchId: string, quantity: number, performedBy?: string) {
  if (quantity <= 0) throw new Error("Transfer quantity must be positive");

  return prisma.$transaction(async (tx) => {
    const source = await tx.batch.findUnique({ where: { id: sourceBatchId } });
    if (!source) throw new Error("Batch not found");
    if (source.quantity < quantity) {
      throw new Error(`Only ${source.quantity} unit(s) available to transfer`);
    }

    const destLocation: BatchLocation = source.location === "STORE" ? "DISPLAY" : "STORE";

    await tx.batch.update({
      where: { id: source.id },
      data: { quantity: { decrement: quantity } },
    });

    const existingDest = await tx.batch.findFirst({
      where: {
        productId: source.productId,
        batchNumber: source.batchNumber,
        location: destLocation,
        expiryDate: source.expiryDate,
        costPrice: source.costPrice,
      },
    });

    const destBatch = existingDest
      ? await tx.batch.update({
          where: { id: existingDest.id },
          data: { quantity: { increment: quantity } },
        })
      : await tx.batch.create({
          data: {
            productId: source.productId,
            batchNumber: source.batchNumber,
            quantity,
            costPrice: source.costPrice,
            expiryDate: source.expiryDate,
            supplierId: source.supplierId,
            location: destLocation,
          },
        });

    const movementType: StockMovementType =
      destLocation === "DISPLAY" ? "TRANSFER_TO_DISPLAY" : "TRANSFER_TO_STORE";

    await tx.stockMovement.createMany({
      data: [
        {
          productId: source.productId,
          batchId: source.id,
          type: movementType,
          quantity: -quantity,
          note: `Transferred to ${destLocation}`,
          performedBy,
        },
        {
          productId: source.productId,
          batchId: destBatch.id,
          type: movementType,
          quantity,
          note: `Transferred from ${source.location}`,
          performedBy,
        },
      ],
    });

    return destBatch;
  });
}

export type WeeklyReportData = {
  weekStart: Date;
  weekEnd: Date;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
  topSellers: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: LowStockItem[];
  expiring: ExpiringBatch[];
};

/** Aggregates sales, inventory alerts for the 7-day window starting at weekStart. */
export async function buildWeeklyReport(weekStart: Date): Promise<WeeklyReportData> {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const saleItems = await prisma.saleItem.findMany({
    where: { sale: { saleDate: { gte: start, lt: end } } },
    include: { product: true },
  });

  const totalRevenue = saleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalCost = saleItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const salesCount = await prisma.sale.count({
    where: { saleDate: { gte: start, lt: end } },
  });

  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of saleItems) {
    const entry = byProduct.get(item.productId) ?? {
      name: item.product.name,
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += item.quantity;
    entry.revenue += item.quantity * item.unitPrice;
    byProduct.set(item.productId, entry);
  }
  const topSellers = Array.from(byProduct.entries())
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const [lowStock, expiring] = await Promise.all([
    getLowStockProducts(),
    getExpiringBatches(),
  ]);

  return {
    weekStart: start,
    weekEnd: end,
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    totalSalesCount: salesCount,
    topSellers,
    lowStock,
    expiring,
  };
}

export async function saveWeeklyReport(report: WeeklyReportData) {
  return prisma.weeklyReport.upsert({
    where: { weekStart_weekEnd: { weekStart: report.weekStart, weekEnd: report.weekEnd } },
    create: {
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      totalRevenue: report.totalRevenue,
      totalCost: report.totalCost,
      totalProfit: report.totalProfit,
      totalSalesCount: report.totalSalesCount,
      topSellersJson: JSON.stringify(report.topSellers),
      lowStockJson: JSON.stringify(report.lowStock),
      expiringJson: JSON.stringify(report.expiring),
    },
    update: {
      totalRevenue: report.totalRevenue,
      totalCost: report.totalCost,
      totalProfit: report.totalProfit,
      totalSalesCount: report.totalSalesCount,
      topSellersJson: JSON.stringify(report.topSellers),
      lowStockJson: JSON.stringify(report.lowStock),
      expiringJson: JSON.stringify(report.expiring),
    },
  });
}

/** Most recent Monday at or before `date` (start of the ISO business week). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type DailyReportData = {
  reportDate: Date;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalSalesCount: number;
  totalPurchaseCount: number;
  totalPurchaseCost: number;
  topSellers: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: LowStockItem[];
  expiring: ExpiringBatch[];
  sales: {
    id: string;
    saleDate: Date;
    totalAmount: number;
    paymentMethod: string;
    cashierName: string | null;
    itemCount: number;
  }[];
  purchases: {
    id: string;
    supplierName: string;
    status: string;
    itemCount: number;
    totalCost: number;
    createdBy: string | null;
  }[];
};

/** Aggregates sales, purchases, and inventory alerts for a single calendar day. */
export async function buildDailyReport(day: Date): Promise<DailyReportData> {
  const start = startOfDay(day);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [saleItems, sales, purchaseOrders, lowStock, expiring] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: start, lt: end } } },
      include: { product: true },
    }),
    prisma.sale.findMany({
      where: { saleDate: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { saleDate: "desc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
    }),
    getLowStockProducts(),
    getExpiringBatches(),
  ]);

  const totalRevenue = saleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalCost = saleItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of saleItems) {
    const entry = byProduct.get(item.productId) ?? {
      name: item.product.name,
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += item.quantity;
    entry.revenue += item.quantity * item.unitPrice;
    byProduct.set(item.productId, entry);
  }
  const topSellers = Array.from(byProduct.entries())
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const totalPurchaseCost = purchaseOrders.reduce(
    (sum, po) => sum + po.items.reduce((s, i) => s + i.quantity * i.unitCost, 0),
    0
  );

  return {
    reportDate: start,
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    totalSalesCount: sales.length,
    totalPurchaseCount: purchaseOrders.length,
    totalPurchaseCost,
    topSellers,
    lowStock,
    expiring,
    sales: sales.map((s) => ({
      id: s.id,
      saleDate: s.saleDate,
      totalAmount: s.totalAmount,
      paymentMethod: s.paymentMethod,
      cashierName: s.cashierName,
      itemCount: s.items.reduce((sum, i) => sum + i.quantity, 0),
    })),
    purchases: purchaseOrders.map((po) => ({
      id: po.id,
      supplierName: po.supplier.name,
      status: po.status,
      itemCount: po.items.reduce((sum, i) => sum + i.quantity, 0),
      totalCost: po.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
      createdBy: po.createdBy,
    })),
  };
}

export async function saveDailyReport(report: DailyReportData) {
  const data = {
    totalRevenue: report.totalRevenue,
    totalCost: report.totalCost,
    totalProfit: report.totalProfit,
    totalSalesCount: report.totalSalesCount,
    totalPurchaseCount: report.totalPurchaseCount,
    totalPurchaseCost: report.totalPurchaseCost,
    topSellersJson: JSON.stringify(report.topSellers),
    lowStockJson: JSON.stringify(report.lowStock),
    expiringJson: JSON.stringify(report.expiring),
  };
  return prisma.dailyReport.upsert({
    where: { reportDate: report.reportDate },
    create: { reportDate: report.reportDate, ...data },
    update: data,
  });
}
