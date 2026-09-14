import { prisma } from "@/lib/prisma";

/**
 * Records one line in the admin action trail — best-effort, never blocks or
 * fails the action it's logging (a missed log entry is far less bad than a
 * failed user/supplier/payment operation because logging hiccuped).
 */
export async function logAudit(actorName: string | undefined, action: string, summary: string) {
  try {
    await prisma.auditLog.create({ data: { actorName, action, summary } });
  } catch {
    // intentionally swallowed — see doc comment above
  }
}
