import ExcelJS from 'exceljs';
import { prisma } from '../../db.js';
import { FIXED_KEYS, HEADERS, STATUS_LABELS, VISA_TYPE_LABELS, type FixedKey, type Lang } from './labels.js';
import { listColumns, loadRows, type RegisterRow } from './rows.js';
import { maskWith, type MaskGroup } from '../privacy/mask.js';

const SHEET_NAME: Record<Lang, string> = { az: 'Müştəri reyestri', de: 'Kundenregister', en: 'Client register', ru: 'Реестр клиентов' };

/** The client register as a styled Excel workbook (bold header, frozen first row, autofilter, widths). */
/** `mask`: groups masked for the viewer (STAFF exports show "•••• 3456" instead of passport numbers). */
export const buildRegisterXlsx = async (lang: Lang, mask: Set<MaskGroup> = new Set()) => {
  const [{ rows }, columns, partners, staff] = await Promise.all([
    loadRows(lang),
    listColumns(),
    prisma.referralPartner.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const staffName = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
  const h = HEADERS[lang];

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET_NAME[lang], { views: [{ state: 'frozen', ySplit: 1 }] });

  const fixedWidth: Record<FixedKey, number> = {
    number: 16,
    firstName: 16,
    lastName: 18,
    passportNumber: 14,
    birthDate: 13,
    phone: 17,
    email: 26,
    visaType: 18,
    category: 22,
    partnerId: 18,
    status: 24,
    assignedStaffId: 20,
    createdAt: 13,
    decisionAt: 13,
    _note: 36,
  };
  ws.columns = [
    ...FIXED_KEYS.map((k) => ({ header: h[k], key: k, width: fixedWidth[k] })),
    { header: h.member, key: '_member', width: 14 },
    ...columns.map((c) => ({ header: c.label, key: `c_${c.id}`, width: Math.max(8, Math.min(60, Math.round(c.width / 7))) })),
  ];

  const date = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00.000Z`) : null);
  const valueOf = (r: RegisterRow, k: FixedKey): ExcelJS.CellValue => {
    switch (k) {
      case 'birthDate':
      case 'createdAt':
      case 'decisionAt':
        return date(r[k]);
      case 'visaType':
        return VISA_TYPE_LABELS[lang][r.visaType];
      case 'status':
        return STATUS_LABELS[lang][r.status];
      case 'partnerId':
        return r.partnerId ? (partnerName.get(r.partnerId) ?? '') : '';
      case 'assignedStaffId':
        return r.assignedStaffId ? (staffName.get(r.assignedStaffId) ?? '') : '';
      case 'passportNumber':
        return maskWith(mask, 'passportNumber', r.passportNumber) ?? '';
      default:
        return (r[k] as string | null) ?? '';
    }
  };
  for (const r of rows) {
    const values: Record<string, ExcelJS.CellValue> = {};
    for (const k of FIXED_KEYS) values[k] = valueOf(r, k);
    values._member = r.kind === 'member' ? `${r.parentNumber ?? ''}${r.relation ? ` · ${r.relation}` : ''}` : '';
    for (const c of columns) {
      const v = r.data[c.id];
      values[`c_${c.id}`] = v === undefined ? null : c.type === 'DATE' && typeof v === 'string' ? date(v) : c.type === 'CHECKBOX' ? (v ? '✓' : '') : v;
    }
    ws.addRow(values);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F44' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  for (const k of ['birthDate', 'createdAt', 'decisionAt']) ws.getColumn(k).numFmt = 'dd.mm.yyyy';
  for (const c of columns) if (c.type === 'DATE') ws.getColumn(`c_${c.id}`).numFmt = 'dd.mm.yyyy';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: ws.columns.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
};
