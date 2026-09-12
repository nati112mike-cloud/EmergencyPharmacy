// SQLite's Prisma connector has no native enum support, so these fields are
// plain strings in the schema; these unions are the source of truth for the
// valid values and give the app layer the same safety a DB enum would.
export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
export type StockMovementType =
  | "PURCHASE_RECEIPT"
  | "SALE"
  | "ADJUSTMENT"
  | "WRITE_OFF_EXPIRED"
  | "TRANSFER_TO_DISPLAY"
  | "TRANSFER_TO_STORE";
export type PaymentMethod = "CASH" | "CARD" | "INSURANCE" | "OTHER";

// Back stock ("STORE") vs shelf stock ("DISPLAY"). POS only sells from
// DISPLAY batches — that's what's physically available to hand a customer.
export type BatchLocation = "STORE" | "DISPLAY";

// Seeded on first run; staff can add more from the Inventory page.
export const DEFAULT_CATEGORY_NAMES = [
  "Drug",
  "Cosmetics",
  "Skincare",
  "Off-Drugs",
  "Formula Milk",
  "Sanitation",
] as const;
