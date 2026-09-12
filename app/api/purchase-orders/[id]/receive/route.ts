import { NextRequest, NextResponse } from "next/server";
import { receivePurchaseOrder } from "@/lib/business";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const po = await receivePurchaseOrder(params.id);
    return NextResponse.json(po);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to receive purchase order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
