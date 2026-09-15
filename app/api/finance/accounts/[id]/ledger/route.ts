import { NextRequest, NextResponse } from "next/server";
import { getAccountLedger, getAccountBalance } from "@/lib/finance";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const [ledger, balance] = await Promise.all([
      getAccountLedger(params.id),
      getAccountBalance(params.id),
    ]);
    return NextResponse.json({ ledger, balance });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load ledger";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
