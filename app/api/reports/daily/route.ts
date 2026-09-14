import { NextRequest, NextResponse } from "next/server";
import { buildDailyReport, saveDailyReport } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// GET ?date=YYYY-MM-DD -> builds and persists the report for that day.
// Defaults to today when no date is given.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const day = dateParam ? new Date(dateParam) : new Date();

  const report = await buildDailyReport(day);
  await saveDailyReport(report);

  return NextResponse.json(report);
}
