import { NextResponse } from "next/server";
import { buildImportTemplate } from "@/lib/inventoryImport";

export async function GET() {
  const buffer = await buildImportTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="inventory-import-template.xlsx"',
    },
  });
}
