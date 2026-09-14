import ExcelJS from "exceljs";

export type ExportSheet = {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
};

/** Builds a multi-sheet .xlsx workbook and returns it as a Buffer, ready to stream back in a response. */
export async function buildWorkbook(sheets: ExportSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function xlsxResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}
