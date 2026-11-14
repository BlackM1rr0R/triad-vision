import ExcelJS from 'exceljs';

/**
 * Excel export of a bulk selection (routes/admin/bulk.ts, "Excel-ə ixrac"): one sheet, bold frozen header with
 * autofilter, dates as real dates, widths fitted to the content. Cells are written as plain values (never
 * formulas), so client input cannot inject spreadsheet formulas.
 */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const text = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

export const toXlsx = async (sheet: string, headers: string[], rows: unknown[][]): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Triad Vision';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheet.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Export', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow(
      r.map((v) => {
        if (v === null || v === undefined) return null;
        if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
        const s = String(v);
        // A leading "=" stays text: exceljs writes strings as shared strings, never as formulas.
        return s;
      }),
    );
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle' };
  head.height = 20;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565E8' } };
  });
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    let w = h.length;
    for (const r of rows.slice(0, 2000)) w = Math.max(w, text(r[i]).length);
    col.width = Math.min(60, Math.max(8, w + 2));
    if (rows.some((r) => r[i] instanceof Date)) col.numFmt = 'dd.mm.yyyy';
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rows.length, column: Math.max(1, headers.length) } };
  return Buffer.from(await wb.xlsx.writeBuffer());
};
