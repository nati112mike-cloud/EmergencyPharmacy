import { NextResponse } from "next/server";
import { getOutstandingCreditSales } from "@/lib/finance";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const sales = await getOutstandingCreditSales();
  return NextResponse.json(sales);
}
