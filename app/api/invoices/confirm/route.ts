import { NextRequest, NextResponse } from "next/server";
import { createPurchaseOrderFromInvoice } from "@/lib/payments";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// body: { supplierId, dueDate, items: [{description, quantity, unitCost}], notes?, fileKey?, fileName? }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { supplierId, dueDate, items, notes, fileKey, fileName } = body;

  if (!supplierId || !dueDate || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "supplierId, dueDate and at least one item are required" },
      { status: 400 }
    );
  }

  try {
    const result = await createPurchaseOrderFromInvoice({
      supplierId,
      dueDate: new Date(dueDate),
      notes,
      invoiceFileName: fileName || undefined,
      invoiceFilePath: fileKey || undefined,
      createdBy: admin.name,
      items: items.map((i: { description: string; quantity: number; unitCost: number }) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitCost: Number(i.unitCost),
      })),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create purchase order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
