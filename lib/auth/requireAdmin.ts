import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/currentUser";
import { SessionPayload } from "@/lib/auth/session";

/** Returns the session if it's an admin, otherwise the NextResponse to send back. */
export async function requireAdmin(): Promise<SessionPayload | NextResponse> {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return session;
}
