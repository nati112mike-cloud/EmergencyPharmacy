import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function minutesUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (60 * 1000));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json(
      {
        error: `Too many failed attempts. Try again in ${minutesUntil(user.lockedUntil)} minute(s).`,
      },
      { status: 429 }
    );
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockingOut ? 0 : attempts,
          lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      });
      if (lockingOut) {
        return NextResponse.json(
          {
            error: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minute(s).`,
          },
          { status: 429 }
        );
      }
    }
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
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
