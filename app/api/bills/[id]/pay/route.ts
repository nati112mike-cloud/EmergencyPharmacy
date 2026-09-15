import { NextRequest, NextResponse } from "next/server";
import { markBillPaid } from "@/lib/payments";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const { paidAmount, paidDate, accountId } = body;

  try {
    const bill = await markBillPaid(
      params.id,
      paidAmount != null ? Number(paidAmount) : undefined,
      paidDate ? new Date(paidDate) : undefined,
      accountId || undefined,
      admin.name
    );
    await logAudit(admin.name, "bill.pay", `Marked bill "${bill.title}" paid ($${(bill.paidAmount ?? bill.amount).toFixed(2)})`);
    return NextResponse.json(bill);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark bill paid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
