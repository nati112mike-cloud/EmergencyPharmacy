import { NextRequest, NextResponse } from "next/server";
import { recordCashDeposit } from "@/lib/finance";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// body: { fromAccountId, toAccountId, amount, note? } — the standard "cash
// collected at POS, deposited into a bank" operation.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { fromAccountId, toAccountId, amount, note } = body;

  if (!fromAccountId || !toAccountId || amount == null) {
    return NextResponse.json({ error: "fromAccountId, toAccountId and amount are required" }, { status: 400 });
  }

  try {
    await recordCashDeposit({
      fromAccountId,
      toAccountId,
      amount: Number(amount),
      note,
      performedBy: admin.name,
    });
    await logAudit(admin.name, "finance.cash_deposit", `Deposited $${Number(amount).toFixed(2)}${note ? ` — ${note}` : ""}`);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record deposit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
