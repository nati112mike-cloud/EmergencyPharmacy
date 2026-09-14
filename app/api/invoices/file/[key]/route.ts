import { NextRequest, NextResponse } from "next/server";
import { readInvoiceFile } from "@/lib/fileStorage";
import { requireAdmin } from "@/lib/auth/requireAdmin";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const buffer = await readInvoiceFile(params.key);
    const ext = params.key.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${params.key}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
