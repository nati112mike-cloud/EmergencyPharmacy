import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

// Renames a category in place — every product referencing it picks up the
// new name automatically (it's a real FK, not a copied string).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const name: string | undefined = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const existing = await prisma.category.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const category = await prisma.category.update({ where: { id: params.id }, data: { name } });
    await logAudit(admin.name, "category.rename", `Renamed category "${existing.name}" to "${name}"`);
    return NextResponse.json(category);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to rename category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
