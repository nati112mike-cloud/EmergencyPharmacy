import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/auditLog";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json();
  const { username, name, password, role } = body;

  if (!username || !name || !password) {
    return NextResponse.json(
      { error: "username, name and password are required" },
      { status: 400 }
    );
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        username,
        name,
        passwordHash: hashPassword(password),
        role: role === "ADMIN" ? "ADMIN" : "STAFF",
      },
      select: { id: true, username: true, name: true, role: true, createdAt: true },
    });
    await logAudit(admin.name, "user.create", `Added user "${user.username}" (${user.name}, ${user.role})`);
    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message.includes("Unique constraint")
        ? "That username is already taken"
        : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
