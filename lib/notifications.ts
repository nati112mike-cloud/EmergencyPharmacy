import { getLowStockProducts, getExpiringBatches, LowStockItem, ExpiringBatch } from "@/lib/business";
import { getUpcomingPayments, UpcomingPayment } from "@/lib/payments";

export type NotificationDigest = {
  lowStock: LowStockItem[];
  expiring: ExpiringBatch[];
  payments: UpcomingPayment[]; // overdue or due soon only — "upcoming" is not urgent enough to email about daily
  hasAnything: boolean;
};

/**
 * A digest of what needs attention right now. Deliberately not "only new
 * since last time" — an unpaid bill or a still-low shelf is exactly the
 * kind of thing that should keep showing up until it's actually resolved;
 * going quiet after the first email is how things get forgotten again.
 */
export async function buildDigest(): Promise<NotificationDigest> {
  const [lowStock, expiring, payments] = await Promise.all([
    getLowStockProducts(),
    getExpiringBatches(),
    getUpcomingPayments(),
  ]);

  const urgentPayments = payments.filter((p) => p.urgency !== "upcoming");

  return {
    lowStock,
    expiring,
    payments: urgentPayments,
    hasAnything: lowStock.length > 0 || expiring.length > 0 || urgentPayments.length > 0,
  };
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function renderDigestEmail(digest: NotificationDigest): {
  subject: string;
  html: string;
  text: string;
} {
  const overdueCount = digest.payments.filter((p) => p.urgency === "overdue").length;

  const subjectParts: string[] = [];
  if (overdueCount > 0) subjectParts.push(`${overdueCount} overdue payment(s)`);
  if (digest.lowStock.length > 0) subjectParts.push(`${digest.lowStock.length} low stock`);
  if (digest.expiring.length > 0) subjectParts.push(`${digest.expiring.length} expiring`);
  const subject = `Meaza Pharmacy: ${subjectParts.join(", ") || "all clear"}`;

  const section = (title: string, rows: string[]) =>
    rows.length === 0
      ? ""
      : `<h2 style="font-size:16px;margin:20px 0 8px;">${title}</h2><ul style="margin:0;padding-left:20px;">${rows
          .map((r) => `<li style="margin-bottom:4px;">${r}</li>`)
          .join("")}</ul>`;

  const paymentRows = digest.payments.map((p) => {
    const when =
      p.urgency === "overdue" ? `overdue by ${Math.abs(p.daysUntilDue)}d` : `due in ${p.daysUntilDue}d`;
    return `${p.title} — ${money(p.amount)} (${when})`;
  });
  const lowStockRows = digest.lowStock.map(
    (p) => `${p.name} — ${p.stock} left (reorder point ${p.reorderPoint})`
  );
  const expiringRows = digest.expiring.map((b) => {
    const when = b.status === "expired" ? "already expired" : `expires in ${b.daysUntilExpiry}d`;
    return `${b.productName} (batch ${b.batchNumber}, ${b.location}) — ${b.quantity} unit(s), ${when}`;
  });

  const html = digest.hasAnything
    ? `<div style="font-family:sans-serif;color:#1a1d23;">
        <p>Here's what needs attention at Meaza Pharmacy:</p>
        ${section("Payments due", paymentRows)}
        ${section("Low stock", lowStockRows)}
        ${section("Expiring stock", expiringRows)}
        <p style="margin-top:20px;color:#64748b;font-size:13px;">Sent automatically — manage everything from the Payments and Inventory pages.</p>
      </div>`
    : `<div style="font-family:sans-serif;color:#1a1d23;"><p>Nothing needs attention right now at Meaza Pharmacy — no overdue payments, low stock, or expiring batches.</p></div>`;

  const text = digest.hasAnything
    ? [
        "Payments due:",
        ...paymentRows.map((r) => `  - ${r}`),
        "",
        "Low stock:",
        ...lowStockRows.map((r) => `  - ${r}`),
        "",
        "Expiring stock:",
        ...expiringRows.map((r) => `  - ${r}`),
      ].join("\n")
    : "Nothing needs attention right now.";

  return { subject, html, text };
}
