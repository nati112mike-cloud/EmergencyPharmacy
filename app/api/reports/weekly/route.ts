import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyReport, saveWeeklyReport, startOfWeek } from "@/lib/business";

// GET ?weekStart=YYYY-MM-DD  -> builds and persists the report for that week.
// Defaults to the current week when no weekStart is given.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");
  const weekStart = startOfWeek(weekStartParam ? new Date(weekStartParam) : new Date());

  const report = await buildWeeklyReport(weekStart);
  await saveWeeklyReport(report);

  return NextResponse.json(report);
}
