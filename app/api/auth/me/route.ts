import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/currentUser";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    id: session.userId,
    username: session.username,
    name: session.name,
    role: session.role,
  });
}
