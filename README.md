# Emergency Pharmacy — Business Assistant

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
  Any product whose non-expired stock falls to or below its `reorderPoint`
  shows up under Suppliers → Reorder Suggestions, one click from becoming a
  purchase order.
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
| `Product` | Catalog entry: SKU, price, reorder point/quantity, default supplier |
| `Batch` | A received lot of a product: quantity remaining, cost, expiry date |
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
- **Inventory** (`/inventory`) — every product with live stock, expiry
  status, and batch-level detail; add new products; record stock receipts.
- **Suppliers** (`/suppliers`) — supplier directory, one-click purchase
  orders from reorder suggestions, and marking POs received (which creates
  the corresponding batches).
- **Reports** (`/reports`) — week-by-week revenue, cost, profit, top sellers,
  low stock, and expiring stock, browsable by week.

## Growth roadmap (natural next steps)

Roughly in the order they'd pay off for a single pharmacy:

1. **Barcode scanning at POS** — swap the search box for a scanner input;
   the API already keys everything off `sku`.
2. **Prescription/customer records** — a `Customer` + `Prescription` model
   linked to `Sale`, plus refill-due reminders. Natural next schema addition.
2. **Low-stock/expiry email or SMS alerts** — a scheduled job hitting
   `getLowStockProducts()` / `getExpiringBatches()` and notifying staff
   instead of requiring someone to open the dashboard.
3. **Multi-branch support** — add a `Location` model and scope `Batch`,
   `Sale`, and reporting queries by it; the schema was kept simple
   deliberately since this is currently a single-location tool.
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
