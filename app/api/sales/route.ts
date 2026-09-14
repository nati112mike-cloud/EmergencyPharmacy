import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkout } from "@/lib/business";
import { PaymentMethod } from "@/lib/types";

// ?date=YYYY-MM-DD restricts to that calendar day (used by the daily
// reports view); otherwise the most recent `limit` sales are returned.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 20);
  const dateParam = searchParams.get("date");

  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (dateParam) {
    const start = new Date(dateParam);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dateFilter = { gte: start, lt: end };
  }

  const sales = await prisma.sale.findMany({
    where: dateFilter ? { saleDate: dateFilter } : undefined,
    include: { items: { include: { product: true } } },
    orderBy: { saleDate: "desc" },
    take: dateFilter ? undefined : limit,
  });
  return NextResponse.json(sales);
}

// body: { items: [{ productId, quantity }], paymentMethod?, cashierName? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { items, paymentMethod, cashierName } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one cart item is required" }, { status: 400 });
  }

  try {
    const result = await checkout(
      items.map((i: { productId: string; quantity: number }) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
      })),
      { paymentMethod: paymentMethod as PaymentMethod | undefined, cashierName }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
