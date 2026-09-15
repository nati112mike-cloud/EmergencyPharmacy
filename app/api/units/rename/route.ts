import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// Unit is a plain string on Product (not its own table), so "renaming" one
// across every product that uses it is a bulk update rather than a single
// row edit — e.g. fixing "Strip" vs "strip" typo drift in one place.
// body: { oldName, newName }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const oldName: string | undefined = body?.oldName?.trim();
  const newName: string | undefined = body?.newName?.trim();
  if (!oldName || !newName) {
    return NextResponse.json({ error: "oldName and newName are required" }, { status: 400 });
  }

  const result = await prisma.product.updateMany({
    where: { unit: oldName },
    data: { unit: newName },
  });
  await logAudit(admin.name, "unit.rename", `Renamed unit "${oldName}" to "${newName}" on ${result.count} product(s)`);
  return NextResponse.json({ ok: true, productsUpdated: result.count });
}
