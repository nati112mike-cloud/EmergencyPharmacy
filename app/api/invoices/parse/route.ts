import { NextRequest, NextResponse } from "next/server";
import { saveInvoiceFile } from "@/lib/fileStorage";
import { parseInvoicePdf } from "@/lib/invoiceParse";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Uploads and stores the invoice file immediately (so it's never lost even if
// the review step is abandoned), and attempts automatic line-item extraction
// for PDFs. Nothing is written to the product/inventory tables here — that
// only happens when the reviewed items are POSTed to /api/invoices/confirm.
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart/form-data upload" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large (15MB limit)" }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileKey = await saveInvoiceFile(buffer, file.name);

    if (!isPdf) {
      return NextResponse.json({
        fileKey,
        fileName: file.name,
        isPdf: false,
        rawText: "",
        lineItems: [],
        detectedSupplierId: null,
        detectedSupplierName: null,
        note: "Automatic item detection only works for PDF invoices right now — enter items manually below. The file is still attached for reference.",
      });
    }

    const extraction = await parseInvoicePdf(buffer);
    return NextResponse.json({
      fileKey,
      fileName: file.name,
      isPdf: true,
      ...extraction,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
