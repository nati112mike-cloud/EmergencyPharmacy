import { prisma } from "@/lib/prisma";
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
};

/** Batches already expired or expiring within EXPIRY_WARNING_DAYS, soonest first. */
export async function getExpiringBatches(): Promise<ExpiringBatch[]> {
  const batches = await prisma.batch.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: true },
    orderBy: { expiryDate: "asc" },
  });

  return batches
    .filter((b) => isExpired(b.expiryDate) || isExpiringSoon(b.expiryDate))
    .map((b) => ({
      batchId: b.id,
      productId: b.productId,
      productName: b.product.name,
      sku: b.product.sku,
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      location: b.location as BatchLocation,
      expiryDate: b.expiryDate,
      daysUntilExpiry: daysUntil(b.expiryDate),
      status: isExpired(b.expiryDate) ? "expired" : "expiring_soon",
    }));
}

export type CartLine = { productId: string; quantity: number };

export type CheckoutResult = {
  saleId: string;
  totalAmount: number;
};

/**
 * Records a sale and decrements stock using FEFO (first-expiry-first-out):
 * each line is fulfilled from the soonest-to-expire non-expired DISPLAY batches
 * first, which is what keeps a pharmacy from selling fresh stock while older
 * stock rots. Only DISPLAY stock is sellable — STORE (back) stock must be
 * transferred to the shelf first via transferStock().
 */
export async function checkout(
  lines: CartLine[],
  opts: { paymentMethod?: PaymentMethod; cashierName?: string } = {}
): Promise<CheckoutResult> {
  if (lines.length === 0) throw new Error("Cart is empty");

  return prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItemsData: {
      productId: string;
      batchId: string | null;
      quantity: number;
      unitPrice: number;
      unitCost: number;
    }[] = [];
    const movements: {
      productId: string;
      batchId: string;
      quantity: number;
    }[] = [];

    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      if (!product) throw new Error(`Product ${line.productId} not found`);

      const batches = await tx.batch.findMany({
        where: { productId: line.productId, quantity: { gt: 0 }, location: "DISPLAY" },
        orderBy: { expiryDate: "asc" },
      });
      const available = batches.filter((b) => !isExpired(b.expiryDate));

      let remaining = line.quantity;
      for (const batch of available) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        if (take <= 0) continue;

        await tx.batch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: take } },
        });

        saleItemsData.push({
          productId: product.id,
          batchId: batch.id,
          quantity: take,
          unitPrice: product.price,
          unitCost: batch.costPrice,
        });
        movements.push({ productId: product.id, batchId: batch.id, quantity: -take });
        totalAmount += take * product.price;
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

    const sale = await tx.sale.create({
      data: {
        totalAmount,
        paymentMethod: opts.paymentMethod ?? "CASH",
        cashierName: opts.cashierName,
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
        },
      });
    }

    return { saleId: sale.id, totalAmount };
  });
}

/** Marks a purchase order as received and creates a stock batch per line item. */
export async function receivePurchaseOrder(purchaseOrderId: string) {
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
export async function transferStock(sourceBatchId: string, quantity: number) {
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
        },
        {
          productId: source.productId,
          batchId: destBatch.id,
          type: movementType,
          quantity,
          note: `Transferred from ${source.location}`,
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
