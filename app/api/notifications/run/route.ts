import { NextRequest, NextResponse } from "next/server";
import { buildDigest, renderDigestEmail } from "@/lib/notifications";
import { isMailerConfigured, sendEmail } from "@/lib/mailer";

// Called on a schedule (see vercel.json) rather than by a signed-in user —
// authenticated with CRON_SECRET instead of a session cookie (this route is
// excluded from the session check in middleware.ts). Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET` automatically when that env var is set.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to || !isMailerConfigured()) {
    return NextResponse.json(
      { error: "Notifications are not configured (SMTP_* / NOTIFY_EMAIL_TO)" },
      { status: 400 }
    );
  }

  const digest = await buildDigest();
  const { subject, html, text } = renderDigestEmail(digest);
  await sendEmail({ to, subject, html, text });

  return NextResponse.json({
    sent: true,
    lowStockCount: digest.lowStock.length,
    expiringCount: digest.expiring.length,
    paymentsCount: digest.payments.length,
  });
}
