// SQLite's Prisma connector has no native enum support, so these fields are
// plain strings in the schema; these unions are the source of truth for the
// valid values and give the app layer the same safety a DB enum would.
export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";
export type StockMovementType = "PURCHASE_RECEIPT" | "SALE" | "ADJUSTMENT" | "WRITE_OFF_EXPIRED";
export type PaymentMethod = "CASH" | "CARD" | "INSURANCE" | "OTHER";
