import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/auditLog";

// Admin-initiated reset — no email needed, just a straight new password,
// which also clears any active lockout from failed attempts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const { newPassword } = body;

  if (!newPassword || String(newPassword).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: params.id },
    data: {
      passwordHash: hashPassword(newPassword),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await logAudit(admin.name, "user.reset_password", `Reset password for "${user.username}" (${user.name})`);
  return NextResponse.json({ ok: true });
}
