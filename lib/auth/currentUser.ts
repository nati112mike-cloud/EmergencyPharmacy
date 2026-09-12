import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, verifySessionToken } from "@/lib/auth/session";

/** Reads and verifies the session cookie for use inside a route handler. */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
