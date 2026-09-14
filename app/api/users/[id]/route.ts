import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  if (params.id === admin.userId) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Can't remove the last admin account" }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id: params.id } });
  await logAudit(admin.name, "user.delete", `Removed user "${target.username}" (${target.name})`);
  return NextResponse.json({ ok: true });
}
