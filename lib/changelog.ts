// Bump APP_VERSION and add an entry here whenever a user-visible change
// ships — shown via the "What's New" panel in the NavBar user menu so staff
// can see what changed without asking.
export const APP_VERSION = "1.1.0";

export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
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
