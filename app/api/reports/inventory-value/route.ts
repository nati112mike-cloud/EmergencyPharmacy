import { NextResponse } from "next/server";
import { getInventoryValue } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// A live snapshot of what's currently on the shelves/in the back room is
// worth — not scoped to any particular day, unlike the daily report.
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const value = await getInventoryValue();
  return NextResponse.json(value);
}
