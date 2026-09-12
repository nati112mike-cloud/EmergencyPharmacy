import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth/currentUser";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function PATCH(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required" },
      { status: 400 }
    );
  }
  if (String(newPassword).length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword) },
  });
  return NextResponse.json({ ok: true });
}
