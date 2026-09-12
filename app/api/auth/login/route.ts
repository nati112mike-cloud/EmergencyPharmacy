import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });

  const res = NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
