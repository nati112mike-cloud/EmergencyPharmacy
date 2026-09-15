import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/business";
import { postFinanceTransaction } from "@/lib/finance";
import { BillType, PaymentStatus, RecurrenceInterval } from "@/lib/types";

/** A payment is flagged "due soon" inside this many days. */
export const PAYMENT_DUE_SOON_DAYS = 7;

export type PaymentUrgency = "overdue" | "due_soon" | "upcoming";

export function paymentUrgency(dueDate: Date): PaymentUrgency {
  const d = daysUntil(dueDate);
  if (d < 0) return "overdue";
  if (d <= PAYMENT_DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

export type UpcomingPayment = {
  id: string;
  kind: "PURCHASE_ORDER" | "BILL";
  title: string;
  amount: number;
  dueDate: Date;
  daysUntilDue: number;
  urgency: PaymentUrgency;
  billType?: BillType;
  supplierName?: string;
};

function poTotal(items: { quantity: number; unitCost: number }[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
}

/** Every unpaid credit purchase (PO) and bill (rent/salary/other), soonest due first. */
export async function getUpcomingPayments(): Promise<UpcomingPayment[]> {
  const [pos, bills] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { paymentStatus: "UNPAID", dueDate: { not: null } },
      include: { supplier: true, items: true },
    }),
    prisma.bill.findMany({ where: { paymentStatus: "UNPAID" } }),
  ]);

  const poPayments: UpcomingPayment[] = pos.map((po) => ({
    id: po.id,
    kind: "PURCHASE_ORDER",
    title: `${po.supplier.name} — credit purchase`,
    amount: poTotal(po.items),
    dueDate: po.dueDate!,
    daysUntilDue: daysUntil(po.dueDate!),
    urgency: paymentUrgency(po.dueDate!),
    supplierName: po.supplier.name,
  }));

  const billPayments: UpcomingPayment[] = bills.map((b) => ({
    id: b.id,
    kind: "BILL",
    title: b.title,
    amount: b.amount,
    dueDate: b.dueDate,
    daysUntilDue: daysUntil(b.dueDate),
    urgency: paymentUrgency(b.dueDate),
    billType: b.type as BillType,
  }));

  return [...poPayments, ...billPayments].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
  );
}

function nextDueDate(current: Date, interval: RecurrenceInterval): Date {
  const d = new Date(current);
  if (interval === "WEEKLY") d.setDate(d.getDate() + 7);
  else if (interval === "MONTHLY") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

export type CreateBillInput = {
  type: BillType;
  title: string;
  amount: number;
  dueDate: Date;
  notes?: string;
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
};

export async function createBill(data: CreateBillInput) {
  return prisma.bill.create({
    data: {
      type: data.type,
      title: data.title,
      amount: data.amount,
      dueDate: data.dueDate,
      notes: data.notes,
      isRecurring: !!data.isRecurring,
      recurrenceInterval: data.isRecurring ? data.recurrenceInterval : null,
    },
  });
}

/**
 * Marks a bill paid. If it's recurring, immediately schedules the next
 * occurrence — this is what keeps rent/salary from being forgotten: the
 * next due date is already sitting on the Payments page the moment this
 * one is settled, instead of depending on someone to remember to add it.
 */
export async function markBillPaid(
  billId: string,
  paidAmount?: number,
  paidDate?: Date,
  accountId?: string,
  performedBy?: string
) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new Error("Bill not found");
    if (bill.paymentStatus === "PAID") throw new Error("Bill already marked paid");

    const amount = paidAmount ?? bill.amount;
    const paid = await tx.bill.update({
      where: { id: billId },
      data: {
        paymentStatus: "PAID" as PaymentStatus,
        paidDate: paidDate ?? new Date(),
        paidAmount: amount,
        paidFromAccountId: accountId,
      },
    });

    if (accountId) {
      await postFinanceTransaction(tx, {
        accountId,
        type: "BILL_PAYMENT",
        amount: -amount,
        reference: `Paid bill "${bill.title}"`,
        performedBy,
      });
    }

    if (bill.isRecurring && bill.recurrenceInterval) {
      await tx.bill.create({
        data: {
          type: bill.type,
          title: bill.title,
          amount: bill.amount,
          dueDate: nextDueDate(bill.dueDate, bill.recurrenceInterval as RecurrenceInterval),
          notes: bill.notes,
          isRecurring: true,
          recurrenceInterval: bill.recurrenceInterval,
        },
      });
    }

    return paid;
  });
}

function slugSku(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `INV-${slug}`.slice(0, 60);
}

export type InvoiceItemInput = { description: string; quantity: number; unitCost: number };

export type CreatePOFromInvoiceInput = {
  supplierId: string;
  dueDate: Date;
  items: InvoiceItemInput[];
  notes?: string;
  invoiceFileName?: string;
  invoiceFilePath?: string;
  createdBy?: string;
};

/**
 * Creates a credit-purchase PurchaseOrder from a reviewed/edited invoice
 * line-item list. Products are matched by exact name (a quick invoice-review
 * form has no room for a SKU field); unmatched names create a new product
 * with price left at $0 until someone sets a real sale price in Inventory.
 */
export async function createPurchaseOrderFromInvoice(input: CreatePOFromInvoiceInput) {
  if (input.items.length === 0) throw new Error("At least one line item is required");

  return prisma.$transaction(async (tx) => {
    const orderItems: { productId: string; quantity: number; unitCost: number }[] = [];
    let productsCreated = 0;

    for (const item of input.items) {
      if (!item.description.trim() || item.quantity <= 0) continue;

      let product = await tx.product.findFirst({ where: { name: item.description } });
      if (!product) {
        product = await tx.product.create({
          data: {
            sku: slugSku(item.description),
            name: item.description,
            defaultSupplierId: input.supplierId,
            price: 0,
          },
        });
        productsCreated++;
      }

      orderItems.push({ productId: product.id, quantity: item.quantity, unitCost: item.unitCost });
    }

    if (orderItems.length === 0) throw new Error("No valid line items to create a purchase order from");

    const po = await tx.purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        status: "ORDERED",
        dueDate: input.dueDate,
        notes: input.notes,
        invoiceFileName: input.invoiceFileName,
        invoiceFilePath: input.invoiceFilePath,
        createdBy: input.createdBy,
        items: { create: orderItems },
      },
      include: { items: { include: { product: true } }, supplier: true },
    });

    return { po, productsCreated };
  });
}

export async function markPurchaseOrderPaid(
  purchaseOrderId: string,
  paidAmount?: number,
  paidDate?: Date,
  accountId?: string,
  performedBy?: string
) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true, supplier: true },
    });
    if (!po) throw new Error("Purchase order not found");
    if (po.paymentStatus === "PAID") throw new Error("Purchase order already marked paid");

    const amount = paidAmount ?? poTotal(po.items);
    const paid = await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        paymentStatus: "PAID" as PaymentStatus,
        paidDate: paidDate ?? new Date(),
        paidAmount: amount,
        paidFromAccountId: accountId,
      },
    });

    if (accountId) {
      await postFinanceTransaction(tx, {
        accountId,
        type: "PURCHASE_PAYMENT",
        amount: -amount,
        reference: `Paid supplier ${po.supplier.name} (PO ${po.id.slice(-8)})`,
        performedBy,
      });
    }

    return paid;
  });
}
