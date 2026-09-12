import { NextRequest, NextResponse } from "next/server";
import { transferStock } from "@/lib/business";

// body: { quantity } — moves quantity to the batch's *other* location
// (STORE -> DISPLAY, or DISPLAY -> STORE to correct a mistaken transfer).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const quantity = Number(body?.quantity);

  if (!quantity || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
  }

  try {
    const batch = await transferStock(params.id, quantity);
    return NextResponse.json(batch);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transfer failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
