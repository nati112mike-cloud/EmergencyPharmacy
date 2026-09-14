import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// GET is open to any signed-in user — STAFF needs the supplier list to pick
// one when creating a purchase order, even though managing suppliers
// (POST/PATCH) is admin-only.
export async function GET() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true, purchaseOrders: true } } },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

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
