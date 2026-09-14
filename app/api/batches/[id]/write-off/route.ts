import { NextRequest, NextResponse } from "next/server";
import { writeOffBatch } from "@/lib/business";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAudit } from "@/lib/auditLog";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const batch = await writeOffBatch(params.id, admin.name);
    await logAudit(admin.name, "batch.write_off", `Wrote off expired batch ${params.id}`);
    return NextResponse.json(batch);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to write off batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
