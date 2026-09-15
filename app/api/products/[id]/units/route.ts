import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// Additional packaging levels for a product (a strip of N tablets, a pack
// of N strips, a box of N packs) — see prisma schema ProductUnit doc
// comment. The product's own `unit`/`price` fields remain the base level.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { name, factor, price } = body;

  if (!name || !factor || price == null) {
    return NextResponse.json({ error: "name, factor and price are required" }, { status: 400 });
  }
  if (Number(factor) <= 1) {
    return NextResponse.json({ error: "factor must be greater than 1 (it's the base unit otherwise)" }, { status: 400 });
  }

  try {
    const unit = await prisma.productUnit.create({
      data: {
        productId: params.id,
        name: String(name).trim(),
        factor: Number(factor),
        price: Number(price),
      },
    });
    await logAudit(admin.name, "product_unit.create", `Added unit "${unit.name}" (×${unit.factor}) to product ${params.id}`);
    return NextResponse.json(unit, { status: 201 });
  } catch (err: unknown) {
    const isDup = err instanceof Error && err.message.includes("Unique constraint");
    const message = isDup ? "That unit name already exists for this product" : err instanceof Error ? err.message : "Failed to add unit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
