import { NextRequest, NextResponse } from "next/server";
import { markPurchaseOrderPaid } from "@/lib/payments";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const { paidAmount, paidDate } = body;

  try {
    const po = await markPurchaseOrderPaid(
      params.id,
      paidAmount != null ? Number(paidAmount) : undefined,
      paidDate ? new Date(paidDate) : undefined
    );
    return NextResponse.json(po);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark purchase order paid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
