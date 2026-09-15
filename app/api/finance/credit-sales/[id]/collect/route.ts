import { NextRequest, NextResponse } from "next/server";
import { collectCreditSale } from "@/lib/finance";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// body: { accountId } — which account the collected money lands in.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { accountId } = body;
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  try {
    await collectCreditSale(params.id, accountId, admin.name);
    await logAudit(admin.name, "finance.credit_collected", `Collected credit sale ${params.id.slice(-8)}`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record collection";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
