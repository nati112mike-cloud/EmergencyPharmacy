import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBill } from "@/lib/payments";
import { BillType, RecurrenceInterval } from "@/lib/types";

export async function GET() {
  const bills = await prisma.bill.findMany({ orderBy: { dueDate: "asc" } });
  return NextResponse.json(bills);
}

// body: { type, title, amount, dueDate, notes?, isRecurring?, recurrenceInterval? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, title, amount, dueDate, notes, isRecurring, recurrenceInterval } = body;

  if (!type || !title || amount == null || !dueDate) {
    return NextResponse.json(
      { error: "type, title, amount and dueDate are required" },
      { status: 400 }
    );
  }
  if (isRecurring && !recurrenceInterval) {
    return NextResponse.json(
      { error: "recurrenceInterval is required when isRecurring is true" },
      { status: 400 }
    );
  }

  try {
    const bill = await createBill({
      type: type as BillType,
      title,
      amount: Number(amount),
      dueDate: new Date(dueDate),
      notes,
      isRecurring: !!isRecurring,
      recurrenceInterval: recurrenceInterval as RecurrenceInterval | undefined,
    });
    return NextResponse.json(bill, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create bill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
