import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { BatchLocation } from "@/lib/types";

// Column aliases are matched case-/space-/punctuation-insensitively, so
// "Batch Number", "batch_number", and "Batch#" all resolve to the same field.
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "productname", "product"],
  sku: ["sku", "code", "productcode"],
  category: ["category", "categories"],
  supplier: ["supplier", "vendor"],
  batchNumber: ["batchnumber", "batch", "lot", "lotnumber", "batchno"],
  quantity: ["quantity", "qty"],
  expiryDate: ["expirydate", "expiry", "expdate", "expirationdate", "expiration"],
  costPrice: ["cost", "unitcost", "costprice"],
  price: ["price", "sellingprice", "saleprice", "unitprice"],
  location: ["location", "storeordisplay"],
  unit: ["unit", "uom"],
  reorderPoint: ["reorderpoint"],
  reorderQty: ["reorderqty", "reorderquantity"],
};

function normalizeKey(key: string): string {
  // Strip parenthetical hints ("SKU (optional)" -> "SKU") before normalizing,
  // so template headers written for humans still match the alias list.
  return key
    .split("(")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildFieldMap(headerRow: string[]): Map<string, number> {
  const fieldToColumnIndex = new Map<string, number>();
  headerRow.forEach((header, idx) => {
    if (!header) return;
    const normalized = normalizeKey(String(header));
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(normalized) && !fieldToColumnIndex.has(field)) {
        fieldToColumnIndex.set(field, idx);
      }
    }
  });
  return fieldToColumnIndex;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value).trim();
}

function cellToDate(value: ExcelJS.CellValue): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  const str = cellToString(value);
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export type ImportRowResult = {
  row: number;
  status: "created" | "updated" | "error";
  productName?: string;
  batchNumber?: string;
  message?: string;
};

export type ImportSummary = {
  totalRows: number;
  categoriesCreated: number;
  suppliersCreated: number;
  productsCreated: number;
  productsUpdated: number;
  batchesCreated: number;
  rows: ImportRowResult[];
};

function slugSku(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `IMP-${slug}`.slice(0, 60);
}

/** Parses an uploaded workbook and upserts Category/Supplier/Product/Batch rows. */
export async function importInventoryWorkbook(buffer: Buffer): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook();
  // exceljs ships its own Buffer typings, which don't line up with the
  // ArrayBufferLike-generic Buffer from newer @types/node — same runtime type.
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheets");

  const headerRow = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) => cellToString(v));
  const fields = buildFieldMap(headerRow);

  for (const required of ["name", "batchNumber", "quantity", "expiryDate"]) {
    if (!fields.has(required)) {
      throw new Error(
        `Missing required column: ${required}. Download the template for the expected headers.`
      );
    }
  }

  const summary: ImportSummary = {
    totalRows: 0,
    categoriesCreated: 0,
    suppliersCreated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    batchesCreated: 0,
    rows: [],
  };

  const categoryCache = new Map<string, string>(); // lowercase name -> id
  const supplierCache = new Map<string, string>(); // lowercase name -> id

  const get = (rowValues: ExcelJS.CellValue[], field: string) => {
    const idx = fields.get(field);
    return idx == null ? undefined : rowValues[idx];
  };

  const lastRow = sheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = row.values as ExcelJS.CellValue[];
    const isBlank = values.every((v) => v == null || cellToString(v) === "");
    if (isBlank) continue;

    summary.totalRows++;

    const name = cellToString(get(values, "name"));
    const batchNumber = cellToString(get(values, "batchNumber"));
    const quantityRaw = cellToString(get(values, "quantity"));
    const expiryDate = cellToDate(get(values, "expiryDate"));
    const quantity = Number(quantityRaw);

    if (!name) {
      summary.rows.push({ row: rowNumber, status: "error", message: "Missing product name" });
      continue;
    }
    if (!batchNumber) {
      summary.rows.push({ row: rowNumber, status: "error", productName: name, message: "Missing batch number" });
      continue;
    }
    if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) {
      summary.rows.push({
        row: rowNumber,
        status: "error",
        productName: name,
        batchNumber,
        message: `Invalid quantity: "${quantityRaw}"`,
      });
      continue;
    }
    if (!expiryDate) {
      summary.rows.push({
        row: rowNumber,
        status: "error",
        productName: name,
        batchNumber,
        message: `Invalid expiry date: "${cellToString(get(values, "expiryDate"))}"`,
      });
      continue;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        let categoryId: string | null = null;
        const categoryName = cellToString(get(values, "category"));
        if (categoryName) {
          const cacheKey = categoryName.toLowerCase();
          if (categoryCache.has(cacheKey)) {
            categoryId = categoryCache.get(cacheKey)!;
          } else {
            const existing = await tx.category.findFirst({
              where: { name: { equals: categoryName } },
            });
            const category = existing ?? (await tx.category.create({ data: { name: categoryName } }));
            if (!existing) summary.categoriesCreated++;
            categoryId = category.id;
            categoryCache.set(cacheKey, category.id);
          }
        }

        let supplierId: string | null = null;
        const supplierName = cellToString(get(values, "supplier"));
        if (supplierName) {
          const cacheKey = supplierName.toLowerCase();
          if (supplierCache.has(cacheKey)) {
            supplierId = supplierCache.get(cacheKey)!;
          } else {
            const existing = await tx.supplier.findFirst({
              where: { name: { equals: supplierName } },
            });
            const supplier = existing ?? (await tx.supplier.create({ data: { name: supplierName } }));
            if (!existing) summary.suppliersCreated++;
            supplierId = supplier.id;
            supplierCache.set(cacheKey, supplier.id);
          }
        }

        const skuCell = cellToString(get(values, "sku"));
        const priceCell = cellToString(get(values, "price"));
        const costCell = cellToString(get(values, "costPrice"));
        const price = priceCell ? Number(priceCell) : 0;
        const costPrice = costCell ? Number(costCell) : 0;
        const unit = cellToString(get(values, "unit")) || "unit";
        const reorderPointCell = cellToString(get(values, "reorderPoint"));
        const reorderQtyCell = cellToString(get(values, "reorderQty"));
        const locationCell = cellToString(get(values, "location")).toUpperCase();
        const location: BatchLocation = locationCell === "DISPLAY" ? "DISPLAY" : "STORE";

        // With an explicit SKU, that's the identity. Without one, match an
        // existing product by exact name first — staff re-typing the same
        // product name for another batch shouldn't create a duplicate just
        // because an earlier row happened to carry a real SKU.
        let product = skuCell
          ? await tx.product.findUnique({ where: { sku: skuCell } })
          : await tx.product.findFirst({ where: { name } });
        const generatedSku = slugSku(name);
        if (!product && !skuCell) {
          product = await tx.product.findUnique({ where: { sku: generatedSku } });
        }
        const sku = skuCell || product?.sku || generatedSku;
        let status: "created" | "updated";
        if (product) {
          status = "updated";
          product = await tx.product.update({
            where: { id: product.id },
            data: {
              name,
              ...(categoryId && { categoryId }),
              ...(supplierId && !product.defaultSupplierId && { defaultSupplierId: supplierId }),
              ...(priceCell && { price }),
            },
          });
          summary.productsUpdated++;
        } else {
          status = "created";
          product = await tx.product.create({
            data: {
              sku,
              name,
              categoryId,
              defaultSupplierId: supplierId,
              price,
              unit,
              reorderPoint: reorderPointCell ? Number(reorderPointCell) : undefined,
              reorderQty: reorderQtyCell ? Number(reorderQtyCell) : undefined,
            },
          });
          summary.productsCreated++;
        }

        const batch = await tx.batch.create({
          data: {
            productId: product.id,
            batchNumber,
            quantity,
            costPrice,
            expiryDate,
            supplierId,
            location,
          },
        });
        summary.batchesCreated++;

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            batchId: batch.id,
            type: "PURCHASE_RECEIPT",
            quantity,
            note: `Imported from spreadsheet (row ${rowNumber})`,
          },
        });

        return { status, priceWasBlank: !priceCell };
      });

      summary.rows.push({
        row: rowNumber,
        status: result.status,
        productName: name,
        batchNumber,
        message: result.priceWasBlank && result.status === "created" ? "Price defaulted to $0.00 — edit before selling" : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed for this row";
      summary.rows.push({ row: rowNumber, status: "error", productName: name, batchNumber, message });
    }
  }

  return summary;
}

/** Builds a starter workbook with the expected headers and one example row. */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Batch Number", key: "batchNumber", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Expiry Date", key: "expiryDate", width: 14 },
    { header: "Category", key: "category", width: 16 },
    { header: "Supplier", key: "supplier", width: 22 },
    { header: "SKU (optional)", key: "sku", width: 16 },
    { header: "Price (optional)", key: "price", width: 12 },
    { header: "Unit Cost (optional)", key: "costPrice", width: 14 },
    { header: "Location (STORE or DISPLAY, optional)", key: "location", width: 20 },
    { header: "Unit (optional)", key: "unit", width: 12 },
    { header: "Reorder Point (optional)", key: "reorderPoint", width: 16 },
    { header: "Reorder Qty (optional)", key: "reorderQty", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    name: "Ibuprofen 200mg (100ct)",
    batchNumber: "B-2024-001",
    quantity: 50,
    expiryDate: "2027-06-30",
    category: "Drug",
    supplier: "PharmaCorp Distribution",
    sku: "MED-1001",
    price: 8.99,
    costPrice: 4.2,
    location: "STORE",
    unit: "box",
    reorderPoint: 15,
    reorderQty: 40,
  });

  return (await workbook.xlsx.writeBuffer()) as never;
}
