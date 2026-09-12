import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { name, contactName, phone, email, address, notes } = body;

  try {
    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(contactName !== undefined && { contactName }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
      },
    });
    return NextResponse.json(supplier);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update supplier";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.supplier.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete supplier";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
