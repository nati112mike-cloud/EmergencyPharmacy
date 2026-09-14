// Bump APP_VERSION and add an entry here whenever a user-visible change
// ships — shown via the "What's New" panel in the NavBar user menu so staff
// can see what changed without asking.
export const APP_VERSION = "1.2.0";

export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "2026-09-14",
    notes: [
      "Barcode scanning at POS — works with hardware scanners and, where supported, the camera.",
      "Returns: refund part or all of a sale line from Daily Reports; stock goes back to its batch.",
      "Expiring stock now shows a suggested markdown, and expired batches can be written off.",
      "Audit log of admin actions (Users page) — who added/removed what, and when.",
      "POS now queues a sale locally if the connection drops, and syncs it automatically once back online.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-14",
    notes: [
      "Staff accounts are now limited to POS and purchase orders; everything else is admin-only.",
      "Edit and delete buttons for products, a unit dropdown, and a Total stock column in Inventory.",
      "Product history: price changes and every stock movement, with who did it.",
      "Reports are now daily (with that day's individual sales and purchases) instead of weekly-only.",
      "Excel export for Inventory, Daily Reports, and Payments.",
      "Show/hide toggle on password fields; a Forgot Password note on login.",
      "Touch-friendly quantity stepper on the POS mobile cart.",
      "Installable as an app from your phone's browser (Add to Home Screen).",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-12",
    notes: [
      "Initial release: inventory, POS, suppliers & purchase orders, payments & bills, weekly reports.",
      "Multi-user login with admin/staff roles, low-stock/expiry/payment email notifications.",
    ],
  },
];
