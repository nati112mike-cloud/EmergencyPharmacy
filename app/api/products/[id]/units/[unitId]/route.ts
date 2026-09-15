import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; unitId: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { name, factor, price } = body;
  if (factor != null && Number(factor) <= 1) {
    return NextResponse.json({ error: "factor must be greater than 1" }, { status: 400 });
  }

  try {
    const unit = await prisma.productUnit.update({
      where: { id: params.unitId },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(factor !== undefined && { factor: Number(factor) }),
        ...(price !== undefined && { price: Number(price) }),
      },
    });
    await logAudit(admin.name, "product_unit.update", `Updated unit "${unit.name}" on product ${params.id}`);
    return NextResponse.json(unit);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update unit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; unitId: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const unit = await prisma.productUnit.delete({ where: { id: params.unitId } });
    await logAudit(admin.name, "product_unit.delete", `Removed unit "${unit.name}" from product ${params.id}`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove unit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
