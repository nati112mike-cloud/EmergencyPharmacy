import { NextRequest, NextResponse } from "next/server";
import { receivePurchaseOrder } from "@/lib/business";
import { getCurrentSession } from "@/lib/auth/currentUser";

// Open to any signed-in user — marking a purchase order received is how
// STAFF completes "posting a purchase" (it's what actually creates the
// stock batch), same access level as creating the PO in the first place.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentSession();
    const po = await receivePurchaseOrder(params.id, session?.name);
    return NextResponse.json(po);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to receive purchase order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
