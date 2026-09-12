import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildDigest, renderDigestEmail } from "@/lib/notifications";
import { isMailerConfigured, sendEmail } from "@/lib/mailer";

// Lets an admin verify SMTP setup on demand instead of waiting for the
// scheduled cron run. Session-authenticated (unlike /api/notifications/run,
// which the cron calls with no session).
export async function POST() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to || !isMailerConfigured()) {
    return NextResponse.json(
      { error: "SMTP_HOST/SMTP_USER/SMTP_PASSWORD and NOTIFY_EMAIL_TO must be set first" },
      { status: 400 }
    );
  }

  try {
    const digest = await buildDigest();
    const { subject, html, text } = renderDigestEmail(digest);
    await sendEmail({ to, subject, html, text });
    return NextResponse.json({ ok: true, sentTo: to });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
