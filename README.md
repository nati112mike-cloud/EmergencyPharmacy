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
- **Payments are tracked before they pile up.** Credit purchases (unpaid
  supplier POs), rent, and salary all carry a due date and show up on one
  Payments page and a Dashboard widget, sorted soonest-first with overdue
  ones flagged — the point is seeing everything coming due in one place
  instead of finding out from a supplier's second phone call.

## Stack

- **Next.js 14 (App Router) + TypeScript** — one codebase for UI and API
  routes, deployable as a single service.
- **Prisma ORM + Postgres**, with real migrations (`prisma/migrations/`) via
  `prisma migrate` — `npm run build` runs `prisma migrate deploy` before
  `next build`, so pushing to `main` and deploying applies any new schema
  changes automatically. Point `DATABASE_URL` at any Postgres (a local one
  for dev, [Neon](https://neon.tech) in production — see Deploying below).
- **Tailwind CSS** for styling.

## Data model (`prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Category` | Open-ended product category (Drug, Cosmetics, Skincare, Off-Drugs, Formula Milk, Sanitation, + anything added) |
| `Product` | Catalog entry: SKU, price, category, reorder point/quantity, default supplier |
| `Batch` | A received lot of a product: quantity remaining, cost, expiry date, and `location` (STORE or DISPLAY) |
| `Supplier` | Vendor contact info |
| `PurchaseOrder` / `PurchaseOrderItem` | Orders placed with suppliers; "receive" turns items into `Batch`es; also carries `dueDate`/`paymentStatus`/invoice attachment for credit purchases |
| `Sale` / `SaleItem` | POS transactions, recorded against specific batches (for FEFO + margin) |
| `StockMovement` | Audit trail of every stock in/out event |
| `Bill` | Rent, salary, or other recurring/one-off payables (not tied to a supplier delivery) |
| `WeeklyReport` | Persisted snapshot of a week's revenue/profit/alerts |
| `User` | A staff login: username, hashed password, name, role (ADMIN or STAFF) |

## Getting started

You need a Postgres database to develop against — either a local one or a
free dev database at [neon.tech](https://neon.tech) (same thing production
uses, so this is the path of least surprise).

```bash
npm install
cp .env.example .env
# Edit .env:
#  - DATABASE_URL: your local Postgres, or a Neon connection string
#  - SESSION_SECRET: a real random value — openssl rand -hex 32
npm run db:migrate          # create the schema (creates prisma/migrations/ on first run)
npm run db:seed             # load sample suppliers/products/sales + two default logins
npm run dev                 # http://localhost:3000
```

`npm run db:studio` opens Prisma Studio if you want to inspect/edit the raw
data directly. `npm run db:push` is available for quick throwaway schema
experiments, but prefer `db:migrate` for anything you're going to commit —
it's what keeps `prisma/migrations/` (and therefore production) in sync.

**Default logins** (created by `db:seed` — change these immediately, see
Authentication below): `admin` / `admin123` (Admin role), `cashier` /
`cashier123` (Staff role).

## Authentication

The whole app — every page and API route — requires a signed-in session;
`middleware.ts` redirects anywhere else to `/login` (and returns a plain 401
for API calls) unless a valid session cookie is present. There was
previously no login at all, which stopped being acceptable once the app
started holding payment and invoice data.

- Passwords are hashed with `scrypt` + a random salt per user
  (`lib/auth/password.ts`) — never stored or logged in plain text.
- Sessions are a signed, expiring token (`lib/auth/session.ts`) in an
  `httpOnly` cookie, verified with the Web Crypto API so the same code works
  in both the Edge-runtime middleware and Node API routes.
- **Users** (`/users`, Admin only) — add or remove staff logins, or
  **reset anyone's password** directly (no email required — hand the new
  password to them yourself). An admin can't remove their own account or
  the last remaining admin, so the app can never lock everyone out.
- **Login is rate-limited**: 5 failed attempts locks that account for 15
  minutes (`failedLoginAttempts`/`lockedUntil` on `User`), even against the
  correct password — resets automatically on a successful login or an admin
  password reset.
- Anyone can change their own password from the account menu in the top
  right (needs the current password).
- POS pre-fills the cashier name from whoever is signed in (still editable).

Change `SESSION_SECRET` in `.env` any time to instantly invalidate every
existing session (forces everyone to log in again) — useful if it's ever
leaked. See `.env.example` for how to generate one.

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
  the corresponding batches); shows payment status/due date and an invoice
  link on any credit purchase.
- **Payments** (`/payments`) — every unpaid credit purchase, rent, and salary
  bill, soonest due first, with overdue ones flagged; add a bill (with
  optional recurrence), mark anything paid, or **upload a purchase invoice**
  (see below).
- **Reports** (`/reports`) — week-by-week revenue, cost, profit, top sellers,
  low stock, and expiring stock, browsable by week.
- **Users** (`/users`, Admin only) — add/remove/reset staff logins, and send
  a test notification digest email (see Notifications below).
- **Login** (`/login`) — the whole app requires signing in; see
  Authentication above.

## Notifications (email digest)

Once `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`NOTIFY_EMAIL_TO`
are set (see `.env.example` — works with Gmail via an
[App Password](https://myaccount.google.com/apppasswords), or any SMTP
provider), a daily email summarizes exactly what needs attention: overdue
and soon-due payments, low-stock products, and expiring/expired batches
(`lib/notifications.ts`). It deliberately isn't "only what's new" — an
unpaid bill or a still-low shelf keeps showing up until it's actually
resolved, since going quiet after one email is how these things get
forgotten again.

- **Sending it**: `GET /api/notifications/run`, authenticated with a
  `CRON_SECRET` bearer token (not a login session) — `vercel.json` schedules
  this daily once deployed. Locally or without Vercel Cron, hit the same URL
  from any scheduler.
- **Testing it**: `/users` → "Send test digest now" (Admin only, uses your
  normal session) sends immediately, so you can confirm SMTP is configured
  correctly without waiting for the schedule.

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

## Payments: bills, credit purchases, and invoice upload

The Payments page (`/payments`) is the single place to see everything the
business owes before it accumulates:

- **Bills** — rent, salary, or anything else (`Bill` model). Mark one
  **recurring** (weekly/monthly/yearly) and paying it automatically
  schedules the next occurrence, so a monthly rent payment never silently
  falls off the radar just because nobody re-entered it.
- **Credit purchases** — a `PurchaseOrder` with a `dueDate` set. These are
  what a supplier invoice actually represents: goods (possibly already
  received) with payment owed later. They show up right alongside bills.
- **Upload Invoice** uploads a supplier invoice file and creates a credit
  purchase from it:
  - **PDF invoices** (including most invoices from a scanner app, which
    usually embed a real text layer): text is extracted automatically
    (`lib/invoiceParse.ts`, via
    [`pdf-parse`](https://github.com/mehmet-kozan/pdf-parse)) and a
    heuristic parser proposes line items (description/qty/unit cost) and
    guesses the supplier from the letterhead. **Nothing is trusted
    blindly** — you review and correct the detected items in an editable
    table before anything is saved.
  - **Photographed/scanned images** (JPG/PNG with no text layer): the file
    is still uploaded and attached for reference, but items are entered
    manually. Real OCR for these (e.g. `tesseract.js`) needs a language
    model fetched from a CDN at first use; that fetch is blocked in this
    dev sandbox so it couldn't be verified end-to-end here — see the
    roadmap below.
  - The payment due date is **always entered manually** (as the invoice
    itself doesn't get read for it) and the uploaded file stays attached
    to the purchase order — "View invoice" opens it from the Suppliers page.
- Uploaded invoice files are stored under `storage/invoices/` (gitignored,
  outside `public/`) and served only through `app/api/invoices/file/[key]`.
  In production, swap this for real object storage (S3 or similar) — local
  disk doesn't survive most container redeploys.

## Growth roadmap (natural next steps)

Roughly in the order they'd pay off for a single pharmacy:

1. **OCR for photographed invoices** — wire up real OCR (`tesseract.js` with
   locally vendored language data so it doesn't depend on a CDN fetch at
   runtime, or a cloud OCR/vision API) so JPG/PNG invoice photos get the
   same automatic line-item detection PDFs already have.
2. **SMS notifications** — the digest currently only emails; add SMS (e.g.
   Twilio) for whoever wants a text instead of/alongside email.
3. **Object storage for invoice files** — `storage/invoices/` is local disk,
   which doesn't survive most serverless/container redeploys (Vercel
   included). Swap `lib/fileStorage.ts` for Vercel Blob or S3 before
   uploaded invoices are something you rely on long-term.
4. **Barcode scanning at POS** — swap the search box for a scanner input;
   the API already keys everything off `sku`.
5. **Prescription/customer records** — a `Customer` + `Prescription` model
   linked to `Sale`, plus refill-due reminders. Natural next schema addition.
6. **Multi-branch support** — add a `Branch` model and scope `Batch`, `Sale`,
   and reporting queries by it (distinct from the existing store/display
   `location` on `Batch`, which is about shelf vs. back-room within one
   branch); the schema was kept simple deliberately since this is currently
   a single-location tool.
7. **Supplier price comparison** — track cost history per supplier per
   product to spot when a vendor's price creeps up.
8. **Self-service "forgot password"** — right now an admin resets a forgotten
   password from `/users`; a real email-based reset flow would remove that
   dependency on an admin being reachable.
9. **Real batch-level receiving on POs** — `receivePurchaseOrder` currently
   defaults new batches to a 2-year placeholder expiry; add expiry/batch
   number entry to the "Mark Received" flow once real supplier paperwork is
   available.

## Deploying to production (Vercel + Neon)

1. **Database** — create a free project at [neon.tech](https://neon.tech),
   then copy its connection string (Neon's dashboard → Connect).
2. **Push this repo to GitHub** if it isn't already.
3. **Import the project into Vercel** ([vercel.com/new](https://vercel.com/new))
   from that GitHub repo — it auto-detects Next.js, no config needed.
4. **Set environment variables** in the Vercel project (Settings →
   Environment Variables) — see `.env.example` for the full list:
   `DATABASE_URL` (the Neon string), `SESSION_SECRET` (generate a fresh one
   for production — don't reuse your local dev value), and, if you want the
   notification digest, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/
   `NOTIFY_EMAIL_TO`/`CRON_SECRET`.
5. **Deploy.** Vercel runs `npm run build`, which runs `prisma migrate
   deploy` first — your schema is created automatically, no manual step.
6. **Create your first real admin account** — don't run `npm run db:seed`
   against production (it deletes everything, including whatever's already
   there, on every run). Instead, from your own machine with `DATABASE_URL`
   pointed at the Neon database:
   ```bash
   npm run create-admin -- youradmin "a-strong-password" "Your Name"
   ```
   This only ever touches that one account — safe to run any time, on a
   fresh database or one already holding real data.
7. **Notifications cron** — `vercel.json` already schedules a daily digest
   (`/api/notifications/run`, 7am UTC — edit the cron expression there for a
   different time) once the `SMTP_*`/`NOTIFY_EMAIL_TO`/`CRON_SECRET` env vars
   above are set. Vercel Cron is a paid-plan feature; on the free Hobby plan,
   trigger the same URL from any external scheduler instead (it needs an
   `Authorization: Bearer <CRON_SECRET>` header).

## Notes on running this in production

- Back up the Neon database on a schedule (Neon supports point-in-time
  restore, but check the retention window on your plan) — sales, inventory,
  and payment data is the business's operating record.
- See the roadmap above for the invoice-file-storage caveat (local disk
  doesn't persist on Vercel) before relying on uploaded invoices long-term.
- Replace local-disk invoice storage (`lib/fileStorage.ts`) with real object
  storage before deploying anywhere without a persistent filesystem.
