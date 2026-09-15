import { NextRequest, NextResponse } from "next/server";
import { getFinanceAccounts, createFinanceAccount } from "@/lib/finance";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";
import { FinanceAccountType } from "@/lib/types";

// GET is open to any signed-in user — POS needs the bank list to offer at
// checkout. Only admins can create accounts (POST).
export async function GET() {
  const accounts = await getFinanceAccounts();
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { type, name, bankName, accountNumber, openingBalance } = body;

  if (!type || !name) {
    return NextResponse.json({ error: "type and name are required" }, { status: 400 });
  }
  if (!["CASH", "BANK", "MOBILE_MONEY"].includes(type)) {
    return NextResponse.json({ error: "type must be CASH, BANK, or MOBILE_MONEY" }, { status: 400 });
  }

  try {
    const account = await createFinanceAccount({
      type: type as FinanceAccountType,
      name,
      bankName,
      accountNumber,
      openingBalance: openingBalance != null ? Number(openingBalance) : undefined,
    });
    await logAudit(admin.name, "finance_account.create", `Added ${type.toLowerCase()} account "${name}"`);
    return NextResponse.json(account, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
