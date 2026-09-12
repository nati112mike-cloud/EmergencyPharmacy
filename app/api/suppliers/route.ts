import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true, purchaseOrders: true } } },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, contactName, phone, email, address, notes } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contactName: contactName || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}
