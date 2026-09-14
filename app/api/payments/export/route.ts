import { NextResponse } from "next/server";
import { getUpcomingPayments } from "@/lib/payments";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildWorkbook, xlsxResponseHeaders } from "@/lib/excelExport";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const payments = await getUpcomingPayments();

  const buffer = await buildWorkbook([
    {
      name: "Upcoming Payments",
      columns: [
        { header: "Due Date", key: "dueDate", width: 14 },
        { header: "Status", key: "urgency", width: 12 },
        { header: "Description", key: "title", width: 30 },
        { header: "Type", key: "type", width: 16 },
        { header: "Amount", key: "amount", width: 12 },
      ],
      rows: payments.map((p) => ({
        dueDate: p.dueDate.toISOString().slice(0, 10),
        urgency: p.urgency,
        title: p.title,
        type: p.kind === "PURCHASE_ORDER" ? "Supplier credit" : p.billType ?? "",
        amount: p.amount,
      })),
    },
  ]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: xlsxResponseHeaders(`payments-${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}
