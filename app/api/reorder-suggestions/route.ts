import { NextResponse } from "next/server";
import { getLowStockProducts } from "@/lib/business";

export async function GET() {
  const suggestions = await getLowStockProducts();
  return NextResponse.json(suggestions);
}
