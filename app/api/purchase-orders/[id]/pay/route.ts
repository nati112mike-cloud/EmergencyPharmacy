import { NextRequest, NextResponse } from "next/server";
import { markPurchaseOrderPaid } from "@/lib/payments";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const { paidAmount, paidDate } = body;

  try {
    const po = await markPurchaseOrderPaid(
      params.id,
      paidAmount != null ? Number(paidAmount) : undefined,
      paidDate ? new Date(paidDate) : undefined
    );
    await logAudit(admin.name, "purchase_order.pay", `Marked purchase order ${po.id.slice(-8)} paid ($${(po.paidAmount ?? 0).toFixed(2)})`);
    return NextResponse.json(po);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark purchase order paid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
