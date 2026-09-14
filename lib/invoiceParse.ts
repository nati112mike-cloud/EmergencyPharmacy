import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";

export type ExtractedLineItem = {
  description: string;
  quantity: number;
  unitCost: number;
};

export type InvoiceExtraction = {
  rawText: string;
  lineItems: ExtractedLineItem[];
  detectedSupplierId: string | null;
  detectedSupplierName: string | null;
};

// Lines containing any of these are almost never a purchasable item row —
// they're headers, totals, or contact info that happens to carry numbers.
const SKIP_LINE_PATTERNS = [
  /invoice/i,
  /subtotal/i,
  /\btotal\b/i,
  /\btax\b/i,
  /\bvat\b/i,
  /balance/i,
  /page\s*\d/i,
  /\bdate\b/i,
  /address/i,
  /phone/i,
  /\bfax\b/i,
  /email/i,
  /website/i,
  /terms/i,
  /thank you/i,
  /bill\s*to/i,
  /ship\s*to/i,
  /\bpo\s*#/i,
  /^description/i,
  /^quantity/i,
  /^qty\b/i,
  /unit\s*price/i,
  /line\s*total/i,
  /^amount/i,
  /^item\s*(code|no|#)/i,
  /^sku\b/i,
  /signature/i,
  /^notes?:/i,
  /due\s*date/i,
  /payment\s*terms/i,
];

// Strips currency symbols/codes so "$12.50", "ETB 12.50" and "Br. 12.50" all
// parse the same as a bare "12.50" — invoices from different suppliers mix
// these inconsistently, and leaving them in front of a number silently
// dropped that number from the trailing-numbers match below.
const CURRENCY_PATTERN = /(?:\$|USD|ETB|Br\.?|birr)\s*/gi;

const NUMBER_PATTERN = /-?\d[\d,]*\.?\d*/g;

function parseNumber(token: string): number {
  return Number(token.replace(/,/g, ""));
}

/**
 * Best-effort heuristic parse — always presented to the user for review,
 * never trusted blindly. Only the *trailing* 2-3 numbers on a line are
 * treated as the qty/price/amount columns; earlier numbers are left in the
 * description, since pharmacy product names routinely embed dosage figures
 * ("Ibuprofen 200mg 100ct") that would otherwise get cut off.
 */
export function extractLineItemsFromText(text: string): ExtractedLineItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ExtractedLineItem[] = [];

  for (const rawLine of lines) {
    if (SKIP_LINE_PATTERNS.some((re) => re.test(rawLine))) continue;
    const line = rawLine.replace(CURRENCY_PATTERN, "");

    const matches = Array.from(line.matchAll(NUMBER_PATTERN));
    if (matches.length < 2) continue;

    const trailingMatches = matches.slice(-3);
    const descEnd = trailingMatches[0].index ?? line.length;
    const description = line.slice(0, descEnd).replace(/[-–—:|]+$/, "").trim();
    if (description.length < 3) continue;

    const trailing = trailingMatches.map((m) => parseNumber(m[0]));
    let quantity: number;
    let unitCost: number;

    if (trailing.length === 3) {
      [quantity, unitCost] = trailing;
    } else {
      const [qty, total] = trailing;
      quantity = qty;
      unitCost = qty > 0 ? total / qty : total;
    }

    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) continue;
    if (quantity <= 0 || quantity > 100000) continue;
    if (unitCost < 0) continue;

    items.push({ description, quantity, unitCost: Math.round(unitCost * 100) / 100 });
  }

  return items;
}

/** Parses an uploaded PDF invoice: extracts text, proposes line items, and guesses the supplier. */
export async function parseInvoicePdf(buffer: Buffer): Promise<InvoiceExtraction> {
  const parser = new PDFParse({ data: buffer });
  let rawText: string;
  try {
    const result = await parser.getText();
    rawText = result.text;
  } finally {
    await parser.destroy();
  }

  const lineItems = extractLineItemsFromText(rawText);

  const suppliers = await prisma.supplier.findMany();
  const headerText = rawText.slice(0, 500).toLowerCase();
  const detected = suppliers.find((s) => headerText.includes(s.name.toLowerCase()));

  return {
    rawText,
    lineItems,
    detectedSupplierId: detected?.id ?? null,
    detectedSupplierName: detected?.name ?? null,
  };
}

/**
 * A short explanation for why detection came back empty or thin, shown to
 * the user in the review step — replaces a silently empty table (which read
 * as "this feature is broken") with a concrete reason and next step.
 */
export function explainExtraction(extraction: InvoiceExtraction): string | undefined {
  if (extraction.lineItems.length > 0) return undefined;
  if (!extraction.rawText.trim()) {
    return "No text could be extracted from this PDF — it's likely a scanned image rather than a real PDF. Enter the line items manually below; the file stays attached for reference.";
  }
  return "Couldn't confidently detect line items in this invoice's layout. Enter them manually below — the extracted file stays attached for reference so you can double-check against it.";
}
