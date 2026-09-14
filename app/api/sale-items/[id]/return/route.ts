import { NextRequest, NextResponse } from "next/server";
import { processReturn } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// body: { quantity, reason? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const quantity = Number(body?.quantity);
  if (!quantity || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
  }

  try {
    const result = await processReturn(params.id, quantity, {
      reason: body?.reason || undefined,
      performedBy: admin.name,
    });
    await logAudit(
      admin.name,
      "sale.return",
      `Refunded ${quantity} unit(s) ($${result.refundAmount.toFixed(2)}) on sale item ${params.id}`
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
