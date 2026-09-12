import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORY_NAMES } from "../lib/types";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding pharmacy sample data…");

  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.weeklyReport.deleteMany();

  const [pharmaCorp, medSupply, wellnessDist] = await Promise.all([
    prisma.supplier.create({
      data: { name: "PharmaCorp Distribution", contactName: "Lena Ortiz", phone: "555-0110", email: "orders@pharmacorp.example" },
    }),
    prisma.supplier.create({
      data: { name: "MedSupply Wholesale", contactName: "Raj Patel", phone: "555-0142", email: "sales@medsupply.example" },
    }),
    prisma.supplier.create({
      data: { name: "Wellness Distributors", contactName: "Amara Chen", phone: "555-0198", email: "hello@wellnessdist.example" },
    }),
  ]);

  const categories = new Map<string, string>(); // name -> id
  for (const name of DEFAULT_CATEGORY_NAMES) {
    const category = await prisma.category.create({ data: { name } });
    categories.set(name, category.id);
  }

  const productDefs = [
    { sku: "MED-1001", name: "Ibuprofen 200mg (100ct)", category: "Drug", price: 8.99, cost: 4.2, reorderPoint: 15, reorderQty: 40, supplier: pharmaCorp },
    { sku: "MED-1002", name: "Acetaminophen 500mg (100ct)", category: "Drug", price: 7.49, cost: 3.5, reorderPoint: 15, reorderQty: 40, supplier: pharmaCorp },
    { sku: "MED-1010", name: "Amoxicillin 500mg (30ct)", category: "Drug", price: 14.99, cost: 8.1, reorderPoint: 10, reorderQty: 25, supplier: medSupply, rx: true },
    { sku: "MED-1011", name: "Azithromycin 250mg (10ct)", category: "Drug", price: 19.99, cost: 11.4, reorderPoint: 8, reorderQty: 20, supplier: medSupply, rx: true },
    { sku: "MED-1020", name: "Loratadine 10mg (30ct)", category: "Drug", price: 11.49, cost: 5.6, reorderPoint: 12, reorderQty: 30, supplier: wellnessDist },
    { sku: "MED-1021", name: "Cetirizine 10mg (30ct)", category: "Drug", price: 10.99, cost: 5.2, reorderPoint: 12, reorderQty: 30, supplier: wellnessDist },
    { sku: "MED-1030", name: "Omeprazole 20mg (14ct)", category: "Drug", price: 13.99, cost: 6.8, reorderPoint: 10, reorderQty: 25, supplier: pharmaCorp },
    { sku: "MED-1050", name: "Insulin Glargine Pen", category: "Drug", price: 89.99, cost: 62.0, reorderPoint: 5, reorderQty: 12, supplier: medSupply, rx: true },
    { sku: "OFD-2001", name: "Vitamin C 1000mg (60ct)", category: "Off-Drugs", price: 9.99, cost: 4.0, reorderPoint: 20, reorderQty: 50, supplier: wellnessDist },
    { sku: "OFD-2002", name: "Multivitamin Daily (90ct)", category: "Off-Drugs", price: 12.99, cost: 5.5, reorderPoint: 20, reorderQty: 50, supplier: wellnessDist },
    { sku: "OFD-2010", name: "Digital Thermometer", category: "Off-Drugs", price: 15.99, cost: 7.0, reorderPoint: 6, reorderQty: 15, supplier: pharmaCorp },
    { sku: "SAN-3001", name: "N95 Face Mask (10pk)", category: "Sanitation", price: 12.49, cost: 5.8, reorderPoint: 15, reorderQty: 40, supplier: wellnessDist },
    { sku: "SAN-3002", name: "Hand Sanitizer Gel 250ml", category: "Sanitation", price: 4.99, cost: 1.8, reorderPoint: 20, reorderQty: 60, supplier: wellnessDist },
    { sku: "COS-4001", name: "Tinted Lip Balm SPF15", category: "Cosmetics", price: 6.49, cost: 2.6, reorderPoint: 15, reorderQty: 30, supplier: wellnessDist },
    { sku: "SKN-5001", name: "Daily Moisturizing Lotion 200ml", category: "Skincare", price: 13.49, cost: 6.0, reorderPoint: 12, reorderQty: 25, supplier: wellnessDist },
    { sku: "SKN-5002", name: "Sunscreen SPF50 100ml", category: "Skincare", price: 16.99, cost: 7.5, reorderPoint: 10, reorderQty: 25, supplier: wellnessDist },
    { sku: "MLK-6001", name: "Infant Formula Stage 1 (900g)", category: "Formula Milk", price: 24.99, cost: 15.0, reorderPoint: 10, reorderQty: 25, supplier: medSupply },
  ];

  const products = [];
  for (const def of productDefs) {
    const product = await prisma.product.create({
      data: {
        sku: def.sku,
        name: def.name,
        categoryId: categories.get(def.category),
        price: def.price,
        reorderPoint: def.reorderPoint,
        reorderQty: def.reorderQty,
        requiresRx: !!def.rx,
        defaultSupplierId: def.supplier.id,
      },
    });
    products.push({ ...product, cost: def.cost, supplierId: def.supplier.id });
  }

  // Batches: mix of back-stock/shelf-stock and healthy/expiring/expired lots
  // so the dashboard, reports, and store-vs-display views all have something
  // real to show out of the box.
  const batchPlans = [
    { qty: 45, expiryDays: 540, location: "STORE" as const },
    { qty: 15, expiryDays: 540, location: "DISPLAY" as const },
    { qty: 25, expiryDays: 45, location: "STORE" as const }, // expiring soon, still in back stock
    { qty: 10, expiryDays: -10, location: "STORE" as const }, // expired, forgotten in back stock
  ];

  // Two products are deliberately seeded near-empty to exercise reorder alerts.
  const lowStockOverrides: Record<string, { qty: number; location: "STORE" | "DISPLAY" }[]> = {
    "MED-1050": [
      { qty: 2, location: "STORE" },
      { qty: 1, location: "DISPLAY" },
    ],
    "OFD-2010": [
      { qty: 1, location: "STORE" },
      { qty: 1, location: "DISPLAY" },
    ],
  };

  for (const [idx, p] of products.entries()) {
    const override = lowStockOverrides[p.sku];
    const plans = override
      ? override.map((o) => ({ qty: o.qty, expiryDays: 540, location: o.location }))
      : batchPlans.filter((_, bIdx) => bIdx < 2 || idx % 3 === 0); // every 3rd product also gets expiring/expired lots

    for (const [bIdx, plan] of plans.entries()) {
      const batch = await prisma.batch.create({
        data: {
          productId: p.id,
          batchNumber: `B${p.sku.slice(-4)}-${bIdx + 1}`,
          quantity: plan.qty,
          costPrice: p.cost,
          expiryDate: daysFromNow(plan.expiryDays),
          supplierId: p.supplierId,
          receivedDate: daysFromNow(-90),
          location: plan.location,
        },
      });
      await prisma.stockMovement.create({
        data: {
          productId: p.id,
          batchId: batch.id,
          type: "PURCHASE_RECEIPT",
          quantity: plan.qty,
          note: "Initial seed stock",
        },
      });
    }
  }

  // Sales history for the last 3 weeks so weekly reports have real trends.
  // POS only sells from DISPLAY stock, so simulated sales draw from there too.
  const refreshedProducts = await prisma.product.findMany({ include: { batches: true } });
  for (let dayOffset = 20; dayOffset >= 0; dayOffset--) {
    const saleDate = daysFromNow(-dayOffset);
    const salesToday = 1 + Math.floor(Math.random() * 4);

    for (let s = 0; s < salesToday; s++) {
      const lineCount = 1 + Math.floor(Math.random() * 3);
      const picked = [...refreshedProducts].sort(() => Math.random() - 0.5).slice(0, lineCount);

      let total = 0;
      const items = [];
      for (const prod of picked) {
        const usableBatch = prod.batches.find(
          (b) => b.location === "DISPLAY" && b.quantity > 0 && b.expiryDate > new Date()
        );
        if (!usableBatch) continue;
        const qty = 1 + Math.floor(Math.random() * 3);
        const take = Math.min(qty, usableBatch.quantity);
        if (take <= 0) continue;
        usableBatch.quantity -= take;
        items.push({
          productId: prod.id,
          batchId: usableBatch.id,
          quantity: take,
          unitPrice: prod.price,
          unitCost: usableBatch.costPrice,
        });
        total += take * prod.price;
      }
      if (items.length === 0) continue;

      await prisma.sale.create({
        data: {
          saleDate,
          totalAmount: total,
          paymentMethod: Math.random() > 0.5 ? "CASH" : "CARD",
          cashierName: "Seed Cashier",
          items: { create: items },
        },
      });
      for (const item of items) {
        await prisma.batch.update({
          where: { id: item.batchId },
          data: { quantity: { decrement: item.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: item.batchId,
            type: "SALE",
            quantity: -item.quantity,
            note: "Seed sale",
          },
        });
      }
    }
  }

  console.log(
    `Seeded ${products.length} products across ${DEFAULT_CATEGORY_NAMES.length} categories and 3 suppliers with sales history.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
