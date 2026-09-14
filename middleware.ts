import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Everything requires a signed-in session except the login page itself, the
// login API it calls, and the notifications cron endpoint (which Vercel
// Cron calls with no session — it authenticates via CRON_SECRET instead,
// checked inside that route). Static assets, the PWA icons/manifest, and
// favicon.ico are excluded so the login page (and a phone's home-screen
// install prompt) can load them before there's a session.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|login|api/auth/login|api/notifications/run).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (session) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
