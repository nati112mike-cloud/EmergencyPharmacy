// SQLite's Prisma connector has no native enum support, so these fields are
// plain strings in the schema; these unions are the source of truth for the
// valid values and give the app layer the same safety a DB enum would.
export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
export type StockMovementType =
  | "PURCHASE_RECEIPT"
  | "SALE"
  | "RETURN"
  | "ADJUSTMENT"
  | "WRITE_OFF_EXPIRED"
  | "TRANSFER_TO_DISPLAY"
  | "TRANSFER_TO_STORE";
export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "INSURANCE"
  | "BANK_TRANSFER"
  | "TELEBIRR"
  | "CREDIT"
  | "OTHER";

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

// Shared by PurchaseOrder (credit purchases) and Bill (rent/salary/other).
export type PaymentStatus = "UNPAID" | "PAID";
export type BillType = "RENT" | "SALARY" | "OTHER";
export type RecurrenceInterval = "WEEKLY" | "MONTHLY" | "YEARLY";

// ADMIN can manage staff accounts (see /users) and everything else; STAFF is
// limited to POS (sales) and purchase orders — see middleware.ts / the
// requireAdmin checks sprinkled through app/api for the actual enforcement.
export type UserRole = "ADMIN" | "STAFF";

// Common pharmacy stock units, offered as a dropdown on the product form
// (with a free-text "Other" escape hatch) so entries stay consistent instead
// of everyone typing their own spelling of "box"/"boxes"/"Box".
export const UNIT_OPTIONS = [
  "unit",
  "box",
  "bottle",
  "strip",
  "tablet",
  "capsule",
  "vial",
  "ampoule",
  "pack",
  "carton",
  "sachet",
  "tube",
  "roll",
  "piece",
] as const;

// Finance ledger — see lib/finance.ts.
export type FinanceAccountType = "CASH" | "BANK" | "MOBILE_MONEY";
export type FinanceTransactionType =
  | "SALE" // a POS sale landing directly in an account (bank transfer, Telebirr)
  | "CASH_DEPOSIT" // cash drawer -> bank (posts two linked transactions)
  | "CREDIT_COLLECTED" // a customer paying off what they owed
  | "BILL_PAYMENT"
  | "PURCHASE_PAYMENT"
  | "ADJUSTMENT";
