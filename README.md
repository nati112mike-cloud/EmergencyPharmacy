# Meaza Pharmacy — Business Assistant

A single-pharmacy business assistant: point-of-sale, inventory & expiry
tracking, supplier/reorder management, and weekly growth reports, in one
Next.js app.

## Why this shape

A pharmacy's core operating loop is: **sell → deplete stock → reorder before
you run out or before it expires → review the numbers → repeat.** The app is
built directly around that loop instead of being a generic CRUD admin:

- **Inventory is batch-based, not just a quantity field.** Every unit
  received is tracked as a `Batch` with its own expiry date and cost. This is
  what makes expiry tracking and margin reporting possible at all — a single
  "stock count" per product can't tell you which units are about to expire
  or what they actually cost you.
- **Sales consume stock FEFO (first-expiry-first-out).** Checkout always
  pulls from the soonest-to-expire batch first (`lib/business.ts#checkout`),
  which is the standard pharmacy practice for minimizing write-offs.
- **Reordering is a suggestion engine, not a form you fill from memory.**
  Any product whose non-expired stock (store + display combined) falls to or
  below its `reorderPoint` shows up under Suppliers → Reorder Suggestions,
  one click from becoming a purchase order.
- **Store stock and display stock are tracked separately.** A `Batch` has a
  `location` of `STORE` (back stock) or `DISPLAY` (shelf stock); POS only
  sells from `DISPLAY`, so a product can be "in stock" for reordering
  purposes while still needing someone to physically restock the shelf —
  Inventory flags this as "Restock shelf" and a `Transfer` button moves
  quantity from a store batch to display (or back, to correct a mistake).
- **Categories are open-ended.** A small default set (Drug, Cosmetics,
  Skincare, Off-Drugs, Formula Milk, Sanitation) is seeded, but they're a
  real `Category` table, not an enum — anyone can add a new one from the
  "Add Product" form.
- **Growth tracking is a weekly cadence**, matching how a small pharmacy
  actually reviews performance — revenue, margin, top sellers, and the two
  things that quietly erode margin if ignored: low stock (lost sales) and
  expiring stock (write-offs).

## Stack

- **Next.js 14 (App Router) + TypeScript** — one codebase for UI and API
  routes, deployable as a single service.
- **Prisma ORM**, defaulting to a local **SQLite** file for zero-config
  development. Swap `DATABASE_URL` for a Postgres connection string to run
  the same schema in production — nothing else changes.
- **Tailwind CSS** for styling.

## Data model (`prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Category` | Open-ended product category (Drug, Cosmetics, Skincare, Off-Drugs, Formula Milk, Sanitation, + anything added) |
| `Product` | Catalog entry: SKU, price, category, reorder point/quantity, default supplier |
| `Batch` | A received lot of a product: quantity remaining, cost, expiry date, and `location` (STORE or DISPLAY) |
| `Supplier` | Vendor contact info |
| `PurchaseOrder` / `PurchaseOrderItem` | Orders placed with suppliers; "receive" turns items into `Batch`es |
| `Sale` / `SaleItem` | POS transactions, recorded against specific batches (for FEFO + margin) |
| `StockMovement` | Audit trail of every stock in/out event |
| `WeeklyReport` | Persisted snapshot of a week's revenue/profit/alerts |

## Getting started

```bash
npm install
cp .env.example .env        # defaults to a local SQLite file
npm run db:push             # create the SQLite schema
npm run db:seed             # load sample suppliers/products/sales
npm run dev                 # http://localhost:3000
```

`npm run db:studio` opens Prisma Studio if you want to inspect/edit the raw
data directly.

## Pages

- **Dashboard** (`/`) — today's sales, this week's revenue/profit, low-stock
  and expiring-stock counts, top sellers.
- **POS** (`/pos`) — search a product, build a cart, check out. Stock is
  decremented FEFO across batches automatically.
- **Inventory** (`/inventory`) — every product with store vs. display stock,
  category, expiry status, and batch-level detail; add new products (with
  inline "add new category"); record stock receipts; transfer stock between
  store and display; **bulk-import products and stock from an Excel file**
  (see below).
- **Suppliers** (`/suppliers`) — supplier directory, one-click purchase
  orders from reorder suggestions, and marking POs received (which creates
  the corresponding batches).
- **Reports** (`/reports`) — week-by-week revenue, cost, profit, top sellers,
  low stock, and expiring stock, browsable by week.

## Bulk inventory import (Excel)

Inventory → "Import from Excel" uploads an `.xlsx` and creates/updates
products and stock batches from it, one row per lot. "Download template"
gives you the exact expected headers with one filled-in example row.

Required columns: **Name, Batch Number, Quantity, Expiry Date**. Recommended:
**Category, Supplier** (created automatically if new). Optional: SKU, Price,
Unit Cost, Location (`STORE` or `DISPLAY`, defaults to `STORE`), Unit,
Reorder Point, Reorder Qty. Column headers are matched case- and
punctuation-insensitively, so "Batch Number", "batch_number", and "Batch #"
all work.

Products are matched by **SKU** when given, otherwise by exact **name** —
so multiple rows for the same product (different batches, different
shipments) correctly add batches to one product instead of duplicating it.
A product created without a Price defaults to $0.00 and the import summary
flags it as a warning so it gets caught before anything sells at that price.
Bad rows (missing quantity, unparseable date, etc.) are reported per-row
without failing the rest of the import.

Implementation: `lib/inventoryImport.ts` (parsing + upsert logic, via
[`exceljs`](https://github.com/exceljs/exceljs)), `app/api/inventory/import`
(upload) and `app/api/inventory/import/template` (template download).

## Growth roadmap (natural next steps)

Roughly in the order they'd pay off for a single pharmacy:

1. **Barcode scanning at POS** — swap the search box for a scanner input;
   the API already keys everything off `sku`.
2. **Prescription/customer records** — a `Customer` + `Prescription` model
   linked to `Sale`, plus refill-due reminders. Natural next schema addition.
2. **Low-stock/expiry email or SMS alerts** — a scheduled job hitting
   `getLowStockProducts()` / `getExpiringBatches()` and notifying staff
   instead of requiring someone to open the dashboard.
3. **Multi-branch support** — add a `Branch` model and scope `Batch`, `Sale`,
   and reporting queries by it (distinct from the existing store/display
   `location` on `Batch`, which is about shelf vs. back-room within one
   branch); the schema was kept simple deliberately since this is currently
   a single-location tool.
4. **Role-based accounts** — currently there's no login; add auth (e.g.
   NextAuth) once more than one person uses the system, so sales/edits are
   attributed to a real user instead of a free-text cashier name.
5. **Supplier price comparison** — track cost history per supplier per
   product to spot when a vendor's price creeps up.
6. **Real batch-level receiving on POs** — `receivePurchaseOrder` currently
   defaults new batches to a 2-year placeholder expiry; add expiry/batch
   number entry to the "Mark Received" flow once real supplier paperwork is
   available.

## Notes on running this in production

- Switch `DATABASE_URL` to Postgres and run `npx prisma migrate deploy`
  instead of `db push` once you have a real migration history.
- Back up the database on a schedule — sales and inventory data is the
  business's operating record.
