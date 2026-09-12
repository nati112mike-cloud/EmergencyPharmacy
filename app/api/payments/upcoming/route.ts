import { NextResponse } from "next/server";
import { getUpcomingPayments } from "@/lib/payments";

export async function GET() {
  const payments = await getUpcomingPayments();
  return NextResponse.json(payments);
}
